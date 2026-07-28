import { getTile } from '../map/TileGrid.js';
import { tileIdAt } from '../map/MapGeometry.js';
import { MapCanvas } from '../map/MapCanvas.js';
import { revealAll, discoveredNodes } from '../map/FogOfWar.js';
import { characterTokens } from '../party/CharacterTokens.js';
import { renderNodeToCanvas, downloadCanvasPNG, exportFilename } from '../map/MapExport.js';
import { findRegionGroups } from '../map/RegionGroups.js';
import { createNodeActions } from './nodeActions.js';
import { createMapAuthoring } from './mapAuthoring.js';
import { createMapTravel } from './mapTravel.js';
import { mustGetElement } from '../ui/dom.js';
import { mountBreadcrumb } from '../ui/Breadcrumb.js';
import { mountWorldTree } from '../ui/WorldTree.js';
import { mountPalettePanel } from '../ui/PalettePanel.js';
import { mountMapControls } from '../ui/MapControls.js';
import { mountMapDescription } from '../ui/MapDescription.js';
import { mountTileTooltip } from '../ui/TileTooltip.js';
import { wireTabs } from '../ui/Tabs.js';
import { isDefeated } from '../entities/Encounter.js';
import { isGM } from '../view/ViewRole.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */

/**
 * The mutable context shared between the map wiring and its two gesture
 * modules (mapAuthoring, mapTravel): the mounted views and the Build/Play UI
 * state. Wiring fills the view fields in mount order; the gesture handlers
 * only run on user events, long after wiring completes, so reading them late
 * is safe (the same late-binding the wiring already relies on for
 * mapControls and nodeActions).
 * @typedef {{
 *   mapCanvas: import('../map/MapCanvas.js').MapCanvas,
 *   inspector: ReturnType<typeof import('../ui/TileInspector.js').mountTileInspector>,
 *   palettePanel: ReturnType<typeof mountPalettePanel>,
 *   tileTooltip: ReturnType<typeof mountTileTooltip>,
 *   breadcrumb: ReturnType<typeof mountBreadcrumb>,
 *   worldTree: ReturnType<typeof mountWorldTree>,
 *   regionTree: ReturnType<typeof mountWorldTree>,
 *   nodeActions: ReturnType<typeof createNodeActions>,
 *   selectedTileId: string | null,
 *   activeBrush: import('../ui/PalettePanel.js').Brush,
 *   fogTool: 'reveal' | 'hide' | null,
 *   regionAnchor: { x: number, y: number } | null,
 *   goToNode: (nodeId: string) => void,
 *   selectTile: (tileId: string) => void,
 *   clearSelection: () => void,
 *   syncPartyMarker: () => void,
 *   refreshMapDescription: () => void,
 * }} MapEnv
 */

/**
 * Everything on and around the map: the canvas and its stroke/click gestures,
 * the breadcrumb and both world trees, the tile inspector, the palette and its
 * drag-drop, fog controls, the screen-reader map description, stroke-level
 * undo, and the Build-rail tools (Undo stroke, Export PNG). Owns the mounts
 * and the location-sync actions; the Build-mode authoring gestures live in
 * mapAuthoring.js and the Play-mode movement in mapTravel.js, sharing state
 * through a MapEnv object.
 * @param {AppContext} app
 */
export function wireMapView(app) {
  const { palette, grid, navigator, partyTracker, toasts, state } = app;

  const canvasEl = /** @type {HTMLCanvasElement} */ (mustGetElement('map-canvas'));

  // The Build rail's tab strip (Paint / Tile / Encounters), so the rail stays
  // one screen tall instead of stacking every card. Selecting a tile jumps to
  // the Tile tab below; everything else is user-driven.
  const buildTabs = wireTabs(mustGetElement('build-tabs'));
  // The Encounters tab's nested Mobs / NPCs strip, splitting the two rosters.
  wireTabs(mustGetElement('build-encounter-tabs'));

  // The shared context the gesture modules read; view fields are assigned as
  // each mount completes below.
  const env = /** @type {MapEnv} */ (
    /** @type {unknown} */ ({
      selectedTileId: null, // tile id selected for inspection/editing in Build mode
      activeBrush: null, // active Build-mode paint brush
      fogTool: null, // active Play-mode GM fog brush
      regionAnchor: null, // first cell of an in-progress region-tool drag
      goToNode,
      selectTile,
      clearSelection,
      syncPartyMarker,
      refreshMapDescription,
    })
  );

  const authoring = createMapAuthoring(app, env);
  const travel = createMapTravel(app, env);
  app.actions.snapshotEdit = authoring.snapshotEdit;
  app.actions.undoStroke = authoring.undoStroke;
  app.actions.meetNPCs = travel.meetNPCsHere;

  /** Show the party marker only on the node the party is actually standing in,
   * and resolve each character's named token for the node being viewed (their
   * own location, or the party's tile for characters still with the party).
   * With the split-party toggle off everyone moves as one, so the individual
   * named tokens stay hidden and only the shared party marker renders. */
  function syncPartyMarker() {
    const position = partyTracker.getPosition();
    const nodeId = navigator.getCurrentNode().id;
    mapCanvas.setPartyTile(position.nodeId === nodeId ? position.tileId : null);
    mapCanvas.setCharacterTokens(
      state.splitParty ? characterTokens(state.characters, position, nodeId) : [],
    );
    syncEncounterMarkers();
    syncNPCMarkers();
    refreshMapDescription();
  }
  app.actions.syncPartyMarker = syncPartyMarker;

  /** Mark the current node's tiles that carry a live (undefeated) encounter, so
   * the map shows where danger lies once the party comes within detection range. */
  function syncEncounterMarkers() {
    const nodeId = navigator.getCurrentNode().id;
    mapCanvas.setEncounterTiles(
      state.encounters
        .filter((e) => e.location && e.location.nodeId === nodeId && !isDefeated(e))
        .map(
          (e) =>
            /** @type {import('../types/entities.js').EncounterLocation} */ (e.location).tileId,
        ),
    );
    // The Build-rail authoring list shows the same node scope, so it refreshes
    // wherever the markers do (navigation and every encounter mutation).
    app.views.buildEncounters?.update();
  }
  app.actions.syncEncounterMarkers = syncEncounterMarkers;

  /** Mark the current node's tiles that hold a placed NPC (distinct blue marker),
   * shown once the party comes within detection range. */
  function syncNPCMarkers() {
    const nodeId = navigator.getCurrentNode().id;
    mapCanvas.setNPCTiles(
      state.npcs
        .filter((n) => n.location && n.location.nodeId === nodeId)
        .map(
          (n) =>
            /** @type {import('../types/entities.js').EncounterLocation} */ (n.location).tileId,
        ),
    );
    // The Build-rail NPC list shows the same node scope, so it refreshes
    // wherever the markers do (navigation and every NPC mutation).
    app.views.buildNPCs?.update();
  }
  app.actions.syncNPCMarkers = syncNPCMarkers;

  /** Re-narrate the current map for the screen-reader live region. Called wherever
   * the node, party, fog, or tiles change (the same events that redraw). */
  function refreshMapDescription() {
    mapDescription.update(
      navigator.getCurrentNode(),
      partyTracker.getPosition(),
      state.mode === 'build',
    );
  }
  app.actions.refreshMapDescription = refreshMapDescription;

  /**
   * Navigate to a node by id and resync every view that reflects the location.
   * @param {string} nodeId
   */
  function goToNode(nodeId) {
    navigator.goTo(nodeId);
    mapCanvas.setNode(navigator.getCurrentNode());
    clearSelection();
    syncPartyMarker();
    syncPaletteKind();
    breadcrumb.update(navigator.getBreadcrumb());
    worldTree.update();
    regionTree.update();
  }

  // Re-read the node in view and every location view from the grid, for a caller
  // that replaced the world underneath them: the node object, the party marker,
  // the breadcrumb, and both trees are all derived from grid contents this tab
  // did not change itself.
  app.actions.resyncMap = () => goToNode(navigator.currentNodeId);

  /** Show the palette only the terrain the current node's kind can use. */
  function syncPaletteKind() {
    palettePanel.setKind(navigator.getCurrentNode().kind);
  }
  app.actions.syncPaletteKind = syncPaletteKind;

  /** Drop any Build-mode tile selection and its inspector/canvas highlight. */
  function clearSelection() {
    env.selectedTileId = null;
    mapCanvas.setSelectedTile(null);
    inspector.setTile(null);
  }
  app.actions.clearSelection = clearSelection;
  app.actions.getSelectedTileId = () => env.selectedTileId;

  /**
   * Select a tile within the current node and point the inspector at it,
   * bringing the Tile tab forward so the inspector is actually visible.
   * @param {string} tileId
   */
  function selectTile(tileId) {
    env.selectedTileId = tileId;
    mapCanvas.setSelectedTile(tileId);
    inspector.setTile(getTile(navigator.getCurrentNode(), tileId) ?? null, true);
    buildTabs.select('build-tab-tile');
  }

  /**
   * Bring a staged location into view: navigate to its node if the GM is
   * looking elsewhere, centre the canvas on its tile, and select the tile so
   * it reads highlighted — without stealing the Build rail's active tab the
   * way selectTile does. How "click an encounter in the Build list" lands on
   * the encounter.
   * @param {import('../types/entities.js').EncounterLocation} location
   */
  function focusLocation(location) {
    if (navigator.getCurrentNode().id !== location.nodeId) {
      if (!grid.getNode(location.nodeId)) return;
      goToNode(location.nodeId);
    }
    env.selectedTileId = location.tileId;
    mapCanvas.setSelectedTile(location.tileId);
    inspector.setTile(getTile(navigator.getCurrentNode(), location.tileId) ?? null, true);
    mapCanvas.centerOnTile(location.tileId);
  }
  app.actions.focusLocation = focusLocation;

  const breadcrumb = mountBreadcrumb(mustGetElement('breadcrumb-container'), goToNode);
  env.breadcrumb = breadcrumb;

  const worldTree = mountWorldTree(mustGetElement('world-tree-container'), {
    getNodes: () => [...grid.nodes.values()],
    getCurrentId: () => navigator.getCurrentNode().id,
    onSelect: goToNode,
    onAddChild: (id) => nodeActions.addChildNode(id),
    onEdit: (id) => nodeActions.editNode(id),
    onDelete: (id) => nodeActions.deleteNode(id),
  });
  app.views.worldTree = worldTree;
  env.worldTree = worldTree;

  // The Play-mode counterpart to the Build-mode world tree: the same hierarchy,
  // but read-only (no add/delete affordances). Players only see nodes the party
  // has actually discovered, so unexplored regions stay hidden from the table;
  // the GM always sees the whole world. Selecting a node offers to teleport the
  // party there.
  const regionTree = mountWorldTree(mustGetElement('region-tree-container'), {
    getNodes: () =>
      isGM(state.role)
        ? [...grid.nodes.values()]
        : discoveredNodes([...grid.nodes.values()], partyTracker.getPosition()),
    getCurrentId: () => navigator.getCurrentNode().id,
    onSelect: travel.teleportToNode,
    collapsible: true,
  });
  app.views.regionTree = regionTree;
  env.regionTree = regionTree;

  /** @type {{ update: () => void } | null} assigned right after mapCanvas exists */
  let mapControls = null;

  const mapCanvas = new MapCanvas(canvasEl, palette, {
    tileSize: 48,
    // Encounter/NPC/POI markers are sensed out to twice the fog reveal radius
    // around the party (and any split-off character), but no further.
    markerRange: partyTracker.revealRadius * 2,
    getNodeName: (nodeId) => grid.getNode(nodeId)?.name,
    onViewChange: () => mapControls?.update(),
    onCellHover: travel.onCellHover,
    onStrokeCell: authoring.onStrokeCell,
    onStrokeEnd: authoring.onStrokeEnd,
    // Build-mode GM right-click (without dragging into a pan): select the cell
    // and open the encounter context dialog for it. Encounter authoring lives
    // in encounterWiring; the action is late-bound like the rest of app.actions.
    onCellContextMenu: (x, y, _tile, clientX, clientY) => {
      if (state.mode !== 'build' || !isGM(state.role)) return;
      selectTile(tileIdAt(x, y));
      app.actions.openEncounterContextMenu(x, y, clientX, clientY);
    },
    onCellClick: travel.onCellClick,
  });
  app.views.mapCanvas = mapCanvas;
  env.mapCanvas = mapCanvas;

  // The node create/edit/delete actions live in their own module; they resync
  // the views above, which now all exist, so their context can be handed over.
  // Earlier handlers close over this binding but only run after wiring, so
  // declaring it here (past their definitions) is safe.
  const nodeActions = createNodeActions({
    grid,
    navigator,
    partyTracker,
    mapCanvas,
    breadcrumb,
    worldTree,
    regionTree,
    goToNode,
    clearSelection,
    syncPaletteKind,
    syncPartyMarker,
    markDirty: () => app.actions.markDirty(),
  });
  env.nodeActions = nodeActions;

  const inspector = authoring.mountInspector(mustGetElement('inspector-container'));
  env.inspector = inspector;

  const tileTooltip = mountTileTooltip(document.body);
  env.tileTooltip = tileTooltip;

  // The tooltip doubles as the palette's hover label, naming each image-only swatch.
  const palettePanel = mountPalettePanel(
    mustGetElement('palette-container'),
    palette,
    (brush) => {
      env.activeBrush = brush;
    },
    tileTooltip,
  );
  env.palettePanel = palettePanel;

  authoring.wireCanvasDrop(canvasEl);

  mapControls = mountMapControls(mustGetElement('map-viewport'), {
    onZoomIn: () => mapCanvas.zoomBy(1.25),
    onZoomOut: () => mapCanvas.zoomBy(1 / 1.25),
    onFit: () => mapCanvas.fit(),
    getZoom: () => mapCanvas.scale,
    // GM fog controls (hidden from the player role via CSS): brushes stroke fog
    // on/off, reveal-all lights the whole current node.
    fog: {
      getTool: () => env.fogTool,
      onToolChange: (tool) => {
        env.fogTool = state.mode === 'play' ? tool : null;
        // A fog brush needs the stroke gesture, which only fires in authoring
        // mode; Build mode keeps authoring on regardless.
        mapCanvas.setAuthoring(state.mode === 'build' || env.fogTool !== null);
      },
      onRevealAll: () => {
        const node = revealAll(navigator.getCurrentNode());
        grid.updateNode(node);
        mapCanvas.refreshNode(node);
        regionTree.update();
        refreshMapDescription();
        app.actions.markDirty();
        toasts.show(`Revealed all of "${node.name}".`);
      },
    },
  });

  const mapDescription = mountMapDescription(mustGetElement('map-viewport'));

  // The map-facing consequences of a mode switch, called by sessionControls
  // after it flips the body classes.
  app.actions.onModeChanged = (mode) => {
    mapCanvas.setRevealAll(mode === 'build');
    mapCanvas.setAuthoring(mode === 'build');
    tileTooltip.hide();
    env.regionAnchor = null;
    env.fogTool = null; // the fog brush is a Play-mode tool; changing modes drops it
    mapControls?.update();
    if (mode !== 'build') clearSelection();
    worldTree.update();
    regionTree.update();
    refreshMapDescription();
  };

  // Likewise for a role switch: players don't get the fog brush or the
  // authoring gesture, and any open tooltip may now show too much.
  app.actions.onRoleChanged = (role) => {
    if (role === 'player') {
      env.fogTool = null;
      mapCanvas.setAuthoring(false);
      mapControls?.update();
    }
    tileTooltip.hide();
    // The sidebar world tree shows everything to the GM but only discovered
    // nodes to players, so a role flip changes its contents.
    regionTree.update();
  };

  // Keep the canvas buffer matched to the CSS size of the element (times the
  // device pixel ratio), so the map fills the fluid layout column instead of
  // staying a fixed 720x540 island; each resize re-frames the node.
  const resizeMapToViewport = () => {
    const dpr = window.devicePixelRatio || 1;
    mapCanvas.resize(
      Math.max(1, Math.round(canvasEl.clientWidth * dpr)),
      Math.max(1, Math.round(canvasEl.clientHeight * dpr)),
    );
  };
  new ResizeObserver(resizeMapToViewport).observe(canvasEl);

  // Build-rail map tools: stroke-level undo and a fog-free PNG export of the
  // current node (Build rail, so GM/Build only — a player never sees these).
  mustGetElement('stroke-undo-btn').addEventListener('click', authoring.undoStroke);
  mustGetElement('export-png-btn').addEventListener('click', async () => {
    const node = navigator.getCurrentNode();
    const canvas = await renderNodeToCanvas(node, {
      tileSize: 64,
      regionGroups: findRegionGroups(node),
      getNodeName: (id) => grid.getNode(id)?.name,
      imageCache: mapCanvas.renderer.imageCache,
    });
    downloadCanvasPNG(canvas, exportFilename(node.name));
    toasts.show(`Exported "${node.name}" as PNG.`);
  });

  mapCanvas.setNode(navigator.getCurrentNode());
  syncPartyMarker();
  syncPaletteKind();
  breadcrumb.update(navigator.getBreadcrumb());
}
