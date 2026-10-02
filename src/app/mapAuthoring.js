import { getTile, updateTileMetadata, withoutDeadLinks } from '../map/TileGrid.js';
import { clientToBuffer, parseCoords, screenToTile, tileIdAt } from '../map/MapGeometry.js';
import {
  paintTile,
  eraseTile,
  erasePath,
  paintRegion,
  isSiteEntrance,
  stampRegionLink,
} from '../map/TilePaint.js';
import { isOverlayType } from '../map/TileCatalog.js';
import { setTileRevealed } from '../map/FogOfWar.js';
import { recallAll, restorePlacements } from '../party/CharacterTokens.js';
import { restoreCreaturePlacements } from '../entities/CreatureMap.js';
import { restoreBindings, tileBindingsLost, unbindTiles } from '../handout/Handouts.js';
import { restoreLinks } from '../quest/QuestLinks.js';
import { unlinkRemovedNodes } from './questCleanup.js';
import { refreshLocationPanels } from './locationPanels.js';
import {
  nodeSnapshot,
  pushEdit,
  popEdit,
  commitEdit,
  addHandoutBindings,
} from '../map/EditHistory.js';
import { revertEdit } from '../map/EditRevert.js';
import { mountTileInspector } from '../ui/TileInspector.js';
import { resyncMapViews } from './mapResync.js';
import { effectiveBrush } from '../view/BuildTool.js';

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
   * @type {import('../map/EditHistory.js').EditSnapshot[]}
   */
  let editHistory = [];

  /** Save the given nodes' state before the edit, onto the stroke-undo ring.
   * @param {...import('../types/map.js').MapNode} nodes */
  function snapshotEdit(...nodes) {
    recordEdit(nodeSnapshot(nodes));
  }

  /** Save a full edit record onto the stroke-undo ring. A generate action
   * builds one that also names the nodes it created and removed and where
   * the party stood.
   * @param {import('../map/EditHistory.js').EditSnapshot} snapshot */
  function recordEdit(snapshot) {
    editHistory = pushEdit(editHistory, snapshot);
  }

  /** Record the nodes of the most recent edit as the edit left them. Every
   * edit calls this when it finishes, so undo can revert only the cells
   * that the edit changed. */
  function finishEdit() {
    editHistory = commitEdit(editHistory, (id) => grid.getNode(id));
  }

  /**
   * Restore the most recent stroke-undo snapshot. Nodes the edit created go
   * first, so a link they hold cannot outlive them. Nodes the edit removed
   * come back next. On each rewritten node, only the cells and fields that
   * the edit changed go back, so a later fog reveal or inspector note stays.
   * A tile link to a node that no longer exists is cleared. A rewritten
   * node deleted since the snapshot stays deleted. Any character or creature
   * the edit moved goes back to their own tile, any handout it made
   * campaign-wide binds to its node again, any quest link it removed comes
   * back, and the entry memory goes back to what the edit found. A quest
   * link to a node the edit created goes with that node. The party moves
   * back when the edit moved it and its
   * node still exists. A view left inside a removed node moves to the first
   * restored node. The panels that filter by location then re-read the state,
   * because a restored location changes which of them show what.
   */
  function undoStroke() {
    const popped = popEdit(editHistory);
    editHistory = popped.history;
    const snapshot = popped.snapshot;
    if (!snapshot) {
      toasts.show('Nothing to undo.');
      return;
    }
    for (const id of snapshot.created) {
      if (grid.getNode(id)) grid.removeNode(id);
    }
    for (const node of snapshot.removed) grid.addNode(node);
    snapshot.nodes.forEach((node, i) => {
      const current = grid.getNode(node.id);
      if (!current) return;
      const reverted = revertEdit(current, node, snapshot.after?.[i] ?? null);
      grid.updateNode(withoutDeadLinks(reverted, (id) => grid.getNode(id) !== undefined));
    });
    state.characters = restorePlacements(state.characters, snapshot.recalled);
    state.creatures = restoreCreaturePlacements(state.creatures, snapshot.creatures);
    state.handouts = restoreBindings(state.handouts, snapshot.handouts);
    // A quest link to a node the undo just removed goes, and a link the edit
    // took off comes back.
    unlinkRemovedNodes(app, new Set(snapshot.created));
    state.quests = restoreLinks(state.quests, snapshot.questLinks ?? []);
    app.views.questPanel.update();
    if (snapshot.entryTiles) state.entryTiles = snapshot.entryTiles;
    const party = snapshot.party;
    if (party && grid.getNode(party.nodeId)) partyTracker.moveTo(party.nodeId, party.tileId);
    if (grid.getNode(navigator.currentNodeId)) {
      resyncMapViews(app, env, { reframe: true });
    } else {
      env.goToNode(snapshot.nodes[0].id);
    }
    refreshLocationPanels(app);
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
    finishEdit();
    app.actions.markDirty();
  }

  /** @param {string} id */
  const isInteriorId = (id) => grid.getNode(id)?.kind === 'interior';
  /** The site entrances the current Region stroke left alone. */
  const keptEntrances = new Set();

  /**
   * Paint one cell with the Region brush: link it to the region the palette
   * picker names, or clear its link for "No region". A cell in another region
   * moves to this one (`TilePaint.paintRegion`). The canvas recomputes its
   * region groups on each cell, where a terrain stroke waits for the end of
   * the stroke, because the region outline is the only thing a region stroke
   * changes on screen. A cell of the 48x48 example world repaints and
   * regroups in about 0.5 ms. A site entrance keeps its link, and the stroke
   * counts it for the toast at its end.
   * @param {string} tileId
   * @returns {boolean} whether the cell changed
   */
  function paintRegionCell(tileId) {
    const node = navigator.getCurrentNode();
    const target = env.palettePanel.regionPicker.getTarget();
    const updated = paintRegion(node, tileId, target, isInteriorId);
    if (updated === node) {
      const tile = getTile(node, tileId);
      if (tile && (tile.childNodeId ?? null) !== target && isSiteEntrance(tile, isInteriorId)) {
        keptEntrances.add(tileId);
      }
      return false;
    }
    grid.updateNode(updated);
    env.mapCanvas.refreshNode(updated);
    if (tileId === env.selectedTileId) {
      env.inspector.setTile(getTile(updated, tileId) ?? null, true);
    }
    app.actions.markDirty();
    return true;
  }

  /**
   * Start the first Region stroke on a node with no children yet. The GM
   * names the new region in the node prompt. The pressed cell then takes the
   * link, and the rest of that drag does nothing, because the prompt took the
   * pointer. The next drag paints as usual.
   * @param {string} tileId
   */
  async function paintFirstRegion(tileId) {
    const id = await env.nodeActions.addChildNode(navigator.currentNodeId);
    if (!id) return;
    env.palettePanel.regionPicker.pick(id);
    snapshotEdit(navigator.getCurrentNode());
    paintRegionCell(tileId);
    settleAfterStroke();
    finishEdit();
  }

  // Build-mode authoring uses strokes. A left-drag applies the active brush
  // to every cell it crosses. A click is a one-cell stroke. This lets the
  // user paint a row in one gesture instead of one click per tile. The
  // Region brush paints a region link the same way.
  /** Whether the current stroke changed any cell. This tells the stroke's
   * end function to settle the deferred derived state. An inspect click
   * never changes a cell. */
  let strokeTouched = false;
  /** Whether the current Region stroke waits on the prompt for a first
   * region, so the rest of the drag paints nothing. */
  let strokeHeld = false;
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
    // A brush paints only while the Paint tab shows it. On the other rail
    // tabs a click inspects the tile instead.
    const active = effectiveBrush(env.activeBrush, env.buildTab);
    // A whole drag counts as one stroke. One snapshot on the first cell
    // makes the stroke the unit of undo. Inspect mode does not change data.
    if (first && active === 'region' && !env.palettePanel.regionPicker.hasRegions()) {
      strokeHeld = true;
      void paintFirstRegion(id);
      return;
    }
    if (strokeHeld) return;
    if (first && active) snapshotEdit(navigator.getCurrentNode());
    if (active === 'region') {
      if (paintRegionCell(id)) strokeTouched = true;
    } else if (active === 'erase') {
      strokeTouched = true;
      applyToTile(id, (node) => eraseTile(node, id));
    } else if (active === 'erase-path') {
      strokeTouched = true;
      applyToTile(id, (node) => erasePath(node, id));
    } else if (active) {
      // Capture the brush here so the closure below keeps the non-null
      // type check.
      const brush = active;
      const overlay = isOverlayType(brush.type);
      const scale = overlay ? 1 : env.palettePanel.getScale();
      // A scaled stamp is a single placement, not a stroke. Dragging at 2x
      // or 3x size creates overlapping blocks. Only the first cell paints.
      if (scale > 1 && !first) return;
      strokeTouched = true;
      const at = parseCoords(id);
      const imageRef = palette.imageFor(brush, at?.x ?? 0, at?.y ?? 0);
      applyToTile(id, (node) => paintTile(node, id, imageRef, overlay, scale));
    } else if (first) {
      // Inspect acts on the pressed cell only. Dragging does not change the
      // selection.
      env.selectTile(id);
    }
  };

  /**
   * A handout bound to a tile that an erase stroke removed binds to the
   * whole node instead. Without this, the handout waits on a tile the party
   * can never stand on, and no player tab ever lists it. The stroke's undo
   * entry records the tile, so undo binds it back.
   */
  function unbindErasedTiles() {
    const node = navigator.getCurrentNode();
    const lost = tileBindingsLost(state.handouts, node.id, (id) => Boolean(getTile(node, id)));
    if (lost.length === 0) return;
    state.handouts = unbindTiles(state.handouts, lost);
    editHistory = addHandoutBindings(editHistory, lost);
    refreshLocationPanels(app);
  }

  const onStrokeEnd = () => {
    strokeHeld = false;
    if (keptEntrances.size) {
      const n = keptEntrances.size;
      const what = n === 1 ? 'a site entrance' : `${n} site entrances`;
      toasts.show(`The Region brush left ${what} unchanged. Use the Tile tab to relink one.`);
      keptEntrances.clear();
    }
    if (
      strokeTouched &&
      state.mode === 'build' &&
      effectiveBrush(env.activeBrush, env.buildTab) === 'erase'
    ) {
      unbindErasedTiles();
    }
    finishEdit();
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
      artName: (imageRef) => palette.artName(imageRef),
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
      onAddHandout: (tileId) => app.actions.addHandoutAt(navigator.currentNodeId, tileId),
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
      const entry = id ? palette.brushById(id) : undefined;
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
      const imageRef = palette.imageFor(entry, coords.x, coords.y);
      applyToTile(tileId, (node) => paintTile(node, tileId, imageRef, overlay, scale));
      settleAfterStroke();
      finishEdit();
    });
  }

  return {
    snapshotEdit,
    recordEdit,
    finishEdit,
    undoStroke,
    applyToTile,
    linkSelectedTile,
    onStrokeCell,
    onStrokeEnd,
    mountInspector,
    wireCanvasDrop,
  };
}
