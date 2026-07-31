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
 * Build-mode authoring for the map view: the paint/erase/region stroke
 * gestures, the drop-paint target, the tile inspector and its link/spawn
 * affordances, and the stroke-level undo ring. Split out of mapWiring so the
 * wiring module stays the mount-and-sync layer; everything here reads the
 * shared MapEnv late (mapCanvas, inspector, nodeActions are assigned during
 * wiring, before any gesture can fire).
 * @param {AppContext} app
 * @param {MapEnv} env
 */
export function createMapAuthoring(app, env) {
  const { palette, grid, navigator, partyTracker, toasts, state } = app;

  /**
   * Build-mode stroke-level undo: an in-memory ring of node snapshots taken
   * before each paint/erase stroke, region link, tile link, drop-paint, and
   * generate, so one bad edit is reversible without reloading a whole earlier
   * save. Session-only — the persisted Undo button stays the save-level story.
   * @type {import('../types/map.js').MapNode[][]}
   */
  let editHistory = [];

  /** Snapshot the given nodes' pre-edit state onto the stroke-undo ring.
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
   * Apply a pure node transform (paint/erase) to the current node, persist it,
   * re-render the canvas, and keep the inspector in sync if it was showing the
   * affected tile. Per-cell derived work (region groups, the screen-reader map
   * description) is deferred to the stroke's end — a drag calls this once per
   * cell crossed, and nobody reads either mid-drag.
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

  /** Recompute the stroke-deferred derived state: region groups, description,
   * and the ways out — a stroke that paints or erases a door or a staircase is
   * exactly what makes an interior sealed or unseals it. */
  function settleAfterStroke() {
    env.mapCanvas.refreshNode(navigator.getCurrentNode());
    env.refreshMapDescription();
    env.syncExits();
  }

  /**
   * Point the selected tile's childNodeId at a node (or null to unlink), so
   * zooming that tile enters the linked node. On outdoor maps the link stamps
   * a 2x2 block (and unlinking clears the whole block); interiors stay
   * single-tile. Re-derives region groups via the canvas refresh so the block
   * outline updates immediately.
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
    // A linked tile leads further in, so it is no longer a way out: linking an
    // interior's only door seals it, and unlinking that tile opens it again.
    env.syncExits();
    app.actions.markDirty();
  }

  /**
   * Resolve a completed region-tool drag: link every existing tile in the
   * marquee block to a child node chosen from the current node's children, or to
   * a newly created one — the area counterpart to the inspector's per-tile link.
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
    // Same as the per-tile link, over a block: every tile in it now leads
    // further in rather than out.
    env.syncExits();
    app.actions.markDirty();
  }

  // Build-mode authoring arrives as strokes: a left-drag applies the active
  // brush to every cell it crosses (a click is a one-cell stroke), so painting
  // a row is one gesture instead of one click per tile. The Region brush
  // instead drags out a marquee block, resolved to a child-node link on release.
  /** Whether the in-progress stroke mutated any cell, so the stroke's end
   * knows to settle deferred derived state (an inspect click never does). */
  let strokeTouched = false;
  /** @type {(x: number, y: number, tile: import('../types/map.js').Tile | null, first: boolean) => void} */
  const onStrokeCell = (x, y, tile, first) => {
    const id = tileIdAt(x, y);
    // Play-mode GM fog brush: strokes reveal/hide fog instead of authoring
    // tiles. Only active while a fog tool is toggled on (which is what put the
    // canvas in authoring mode outside Build).
    if (state.mode === 'play') {
      if (env.fogTool) {
        strokeTouched = true;
        applyToTile(id, (node) => setTileRevealed(node, id, env.fogTool === 'reveal'));
      }
      return;
    }
    // A whole drag coalesces into one stroke, so one snapshot on its first
    // cell makes the stroke the unit of undo. Inspect (no brush) and the
    // region marquee don't mutate here; the region tool snapshots on link.
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
      // Captured so the closure below keeps the non-null narrowing.
      const brush = env.activeBrush;
      const overlay = isOverlayType(brush.type);
      const scale = overlay ? 1 : env.palettePanel.getScale();
      // A scaled stamp is a single placement, not a stroke: dragging with a
      // 2x/3x size would litter overlapping blocks, so only the first cell
      // paints.
      if (scale > 1 && !first) return;
      strokeTouched = true;
      applyToTile(id, (node) => paintTile(node, id, brush.imageRef, overlay, scale));
    } else if (first) {
      // Inspect acts on the pressed cell only; dragging doesn't re-select.
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
   * Mount the Build-rail tile inspector: metadata edits, the per-tile child
   * link (with create-new), and spawn placement.
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
      // Build-mode spawn placement: make the selected tile the party's start.
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
   * Make the canvas a drop target for palette swatches: dragging a tile onto a
   * grid cell paints it there, an alternative to selecting a brush and clicking.
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
