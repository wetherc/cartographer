import { getTile, updateTileMetadata } from '../map/TileGrid.js';
import { clientToBuffer, screenToTile, tileIdAt } from '../map/MapGeometry.js';
import {
  paintTile,
  eraseTile,
  erasePath,
  normalizeRect,
  tilesInRect,
  linkTilesInRect,
  stampRegionLink,
} from '../map/TilePaint.js';
import { isOverlayType } from '../map/TilePalette.js';
import { setTileRevealed } from '../map/FogOfWar.js';
import { recallAll } from '../party/CharacterTokens.js';
import { pushEdit, popEdit } from '../map/EditHistory.js';
import { mountTileInspector } from '../ui/TileInspector.js';
import { promptModal, alertModal } from '../ui/Modal.js';
import { resyncMapViews } from './mapResync.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('./mapWiring.js').MapEnv} MapEnv */

/**
 * This module builds Build-mode authoring for the map view. It handles the
 * paint, erase, and region stroke gestures, the drop-paint target, the tile
 * inspector with its link and spawn functions, and the stroke-level undo
 * ring. The code stays separate from mapWiring, so the wiring module only
 * mounts views and keeps them in sync. Every function here reads the shared
 * MapEnv late. Wiring assigns mapCanvas, inspector, and nodeActions before a
 * gesture can happen.
 * @param {AppContext} app
 * @param {MapEnv} env
 */
export function createMapAuthoring(app, env) {
  const { palette, grid, navigator, partyTracker, toasts, state } = app;

  /**
   * Stroke-level undo for Build mode: an in-memory ring of node snapshots.
   * The code takes one snapshot before each paint, erase, region link, tile
   * link, drop-paint, or generate action. This lets the user undo one bad
   * edit without a reload. The ring lasts only for this session. The
   * persisted Undo button still handles undo at the save level.
   * @type {import('../types/map.js').MapNode[][]}
   */
  let editHistory = [];

  /** Save the given nodes' state before the edit, onto the stroke-undo ring.
   * @param {...import('../types/map.js').MapNode} nodes */
  function snapshotEdit(...nodes) {
    editHistory = pushEdit(editHistory, nodes);
  }

  /** Restore the most recent stroke-undo snapshot, skipping nodes deleted since. */
  function undoStroke() {
    const popped = popEdit(editHistory);
    editHistory = popped.history;
    if (!popped.nodes) {
      toasts.show('Nothing to undo.');
      return;
    }
    for (const node of popped.nodes) {
      if (grid.getNode(node.id)) grid.updateNode(node);
    }
    resyncMapViews(app, env, { reframe: true });
    app.actions.markDirty();
    toasts.show('Undid the last edit.');
  }

  /**
   * Apply a pure node transform (paint or erase) to the current node. The
   * function saves the node, draws the canvas again, and updates the
   * inspector if it shows the affected tile. Per-cell derived work, such as
   * region groups and the screen-reader map description, waits until the end
   * of the stroke. A drag calls this function once for each cell it crosses.
   * Nothing reads the derived work during the drag.
   * @param {string} tileId
   * @param {(node: import('../types/map.js').MapNode) => import('../types/map.js').MapNode} transform
   */
  function applyToTile(tileId, transform) {
    const updated = transform(navigator.getCurrentNode());
    grid.updateNode(updated);
    env.mapCanvas.refreshNodeTiles(updated);
    if (tileId === env.selectedTileId) {
      env.inspector.setTile(getTile(updated, tileId) ?? null, true);
    }
    app.actions.markDirty();
  }

  /** Recompute the derived state deferred during the stroke: region groups,
   * the description, and the ways out. A stroke that paints or erases a door
   * or a staircase can seal or unseal an interior. */
  function settleAfterStroke() {
    env.mapCanvas.refreshNode(navigator.getCurrentNode());
    env.refreshMapDescription();
    env.syncExits();
  }

  /**
   * Set the selected tile's childNodeId to a node, or to null to unlink it.
   * When a tile links to a node, a zoom on that tile enters the linked node.
   * On outdoor maps, a link stamps a 2x2 block. Unlinking clears the whole
   * block. Interiors keep a single tile. The canvas refresh recomputes region
   * groups, so the block outline updates at once.
   * @param {string | null} childNodeId
   */
  function linkSelectedTile(childNodeId) {
    if (!env.selectedTileId) return;
    const node = navigator.getCurrentNode();
    snapshotEdit(node);
    const updated = stampRegionLink(node, env.selectedTileId, childNodeId);
    grid.updateNode(updated);
    env.mapCanvas.refreshNode(updated);
    env.inspector.setTile(getTile(updated, env.selectedTileId) ?? null, true);
    // A linked tile leads further into the map, so it is no longer a way
    // out. Linking an interior's only door seals it. Unlinking the tile
    // opens it again.
    env.syncExits();
    app.actions.markDirty();
  }

  /**
   * Resolve a completed region-tool drag. Link every existing tile in the
   * marquee block to a child node. The user picks the child node from the
   * current node's children, or creates a new one. This function is the
   * area version of the inspector's per-tile link.
   */
  async function finishRegionStroke() {
    const rect = env.mapCanvas.marquee;
    env.regionAnchor = null;
    env.mapCanvas.setMarquee(null);
    if (!rect) return;
    const node = navigator.getCurrentNode();
    if (!tilesInRect(node, rect).length) {
      await alertModal('No tiles in the selected block. Paint tiles first, then link them.');
      return;
    }
    const children = grid.getChildren(node.id);
    /** @type {string | null} */
    let childId;
    if (children.length) {
      const values = await promptModal(
        'Link region block',
        [
          {
            name: 'target',
            label: 'Link to',
            type: 'select',
            options: [
              ...children.map((c) => ({ value: c.id, label: c.name })),
              { value: '', label: 'Create new region...' },
            ],
          },
        ],
        { submitLabel: 'Link' },
      );
      if (!values) return;
      childId = values.target || (await env.nodeActions.addChildNode(node.id));
    } else {
      childId = await env.nodeActions.addChildNode(node.id);
    }
    if (!childId) return;
    snapshotEdit(navigator.getCurrentNode());
    const updated = linkTilesInRect(navigator.getCurrentNode(), rect, childId);
    grid.updateNode(updated);
    env.mapCanvas.refreshNode(updated);
    if (env.selectedTileId)
      env.inspector.setTile(getTile(updated, env.selectedTileId) ?? null, true);
    // Same as the per-tile link, but for a whole block. Every tile in the
    // block now leads further into the map instead of out.
    env.syncExits();
    app.actions.markDirty();
  }

  // Build-mode authoring uses strokes. A left-drag applies the active brush
  // to every cell it crosses. A click is a one-cell stroke. This lets the
  // user paint a row in one gesture instead of one click per tile. The
  // Region brush instead drags out a marquee block. The block resolves to a
  // child-node link on release.
  /** Whether the current stroke changed any cell. This tells the stroke's
   * end function to settle the deferred derived state. An inspect click
   * never changes a cell. */
  let strokeTouched = false;
  /** @type {(x: number, y: number, tile: import('../types/map.js').Tile | null, first: boolean) => void} */
  const onStrokeCell = (x, y, tile, first) => {
    const id = tileIdAt(x, y);
    // Play-mode GM fog brush. A stroke reveals or hides fog instead of
    // changing tiles. This works only while a fog tool is on. The fog tool
    // is also what puts the canvas in authoring mode outside Build mode.
    if (state.mode === 'play') {
      if (env.fogTool) {
        strokeTouched = true;
        applyToTile(id, (node) => setTileRevealed(node, id, env.fogTool === 'reveal'));
      }
      return;
    }
    // A whole drag counts as one stroke. One snapshot on the first cell
    // makes the stroke the unit of undo. Inspect mode and the region
    // marquee do not change data here. The region tool takes its snapshot
    // at link time.
    if (first && env.activeBrush && env.activeBrush !== 'region') {
      snapshotEdit(navigator.getCurrentNode());
    }
    if (env.activeBrush === 'region') {
      if (first) env.regionAnchor = { x, y };
      if (env.regionAnchor) env.mapCanvas.setMarquee(normalizeRect(env.regionAnchor, { x, y }));
    } else if (env.activeBrush === 'erase') {
      strokeTouched = true;
      applyToTile(id, (node) => eraseTile(node, id));
    } else if (env.activeBrush === 'erase-path') {
      strokeTouched = true;
      applyToTile(id, (node) => erasePath(node, id));
    } else if (env.activeBrush) {
      // Capture the brush here so the closure below keeps the non-null
      // type check.
      const brush = env.activeBrush;
      const overlay = isOverlayType(brush.type);
      const scale = overlay ? 1 : env.palettePanel.getScale();
      // A scaled stamp is a single placement, not a stroke. Dragging at 2x
      // or 3x size creates overlapping blocks. Only the first cell paints.
      if (scale > 1 && !first) return;
      strokeTouched = true;
      applyToTile(id, (node) => paintTile(node, id, brush.imageRef, overlay, scale));
    } else if (first) {
      // Inspect acts on the pressed cell only. Dragging does not change the
      // selection.
      env.selectTile(id);
    }
  };

  const onStrokeEnd = () => {
    if (env.regionAnchor) finishRegionStroke();
    if (strokeTouched) {
      strokeTouched = false;
      settleAfterStroke();
    }
  };

  /**
   * Mount the Build-rail tile inspector. It handles metadata edits, the
   * per-tile child link (with create-new), and spawn placement.
   * @param {HTMLElement} container
   */
  function mountInspector(container) {
    return mountTileInspector(container, {
      onChange: (patch) => {
        if (!env.selectedTileId) return;
        const updated = updateTileMetadata(navigator.getCurrentNode(), env.selectedTileId, patch);
        grid.updateNode(updated);
        env.mapCanvas.refreshNode(updated);
        env.inspector.setTile(getTile(updated, env.selectedTileId) ?? null, true);
        app.actions.markDirty();
      },
      linking: {
        getOptions: () =>
          grid.getChildren(navigator.currentNodeId).map((n) => ({ id: n.id, name: n.name })),
        onChange: (childNodeId) => linkSelectedTile(childNodeId),
        onCreateNew: async () => {
          const id = await env.nodeActions.addChildNode(navigator.currentNodeId);
          if (id) linkSelectedTile(id);
        },
      },
      // Build-mode spawn placement. Set the selected tile as the party's
      // start point.
      onSetSpawn: (tileId) => {
        partyTracker.moveTo(navigator.getCurrentNode().id, tileId);
        state.characters = recallAll(state.characters);
        env.mapCanvas.refreshNode(navigator.getCurrentNode());
        env.syncPartyMarker();
        app.actions.markDirty();
      },
    });
  }

  /**
   * Make the canvas a drop target for palette swatches. The user can drag a
   * tile onto a grid cell to paint it there. This is an alternative to
   * selecting a brush and clicking.
   * @param {HTMLCanvasElement} canvasEl
   */
  function wireCanvasDrop(canvasEl) {
    canvasEl.addEventListener('dragover', (event) => {
      if (state.mode === 'build') event.preventDefault();
    });
    canvasEl.addEventListener('drop', (event) => {
      if (state.mode !== 'build') return;
      event.preventDefault();
      const id = event.dataTransfer?.getData('text/tile-id');
      const entry = id ? palette.get(id) : undefined;
      if (!entry) return;
      const rect = canvasEl.getBoundingClientRect();
      const buffer = clientToBuffer(
        event.clientX,
        event.clientY,
        rect,
        canvasEl.width,
        canvasEl.height,
      );
      const coords = screenToTile(
        buffer.x,
        buffer.y,
        env.mapCanvas.tileSize,
        env.mapCanvas.offsetX,
        env.mapCanvas.offsetY,
        env.mapCanvas.scale,
      );
      const tileId = tileIdAt(coords.x, coords.y);
      snapshotEdit(navigator.getCurrentNode());
      const overlay = isOverlayType(entry.type);
      const scale = overlay ? 1 : env.palettePanel.getScale();
      applyToTile(tileId, (node) => paintTile(node, tileId, entry.imageRef, overlay, scale));
      settleAfterStroke();
    });
  }

  return {
    snapshotEdit,
    undoStroke,
    applyToTile,
    linkSelectedTile,
    onStrokeCell,
    onStrokeEnd,
    mountInspector,
    wireCanvasDrop,
  };
}
