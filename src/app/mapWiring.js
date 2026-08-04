import { getTile } from '../map/TileGrid.js';
import { describeNode } from '../map/MapDescription.js';
import { tileIdAt } from '../map/MapGeometry.js';
import { MapCanvas } from '../map/MapCanvas.js';
import { revealAll, discoveredNodes } from '../map/FogOfWar.js';
import { characterTokens } from '../party/CharacterTokens.js';
import { renderNodeToCanvas, downloadCanvasPNG, exportFilename } from '../map/MapExport.js';
import { findRegionGroups } from '../map/RegionGroups.js';
import { authoringWarning } from '../map/MapExits.js';
import { createNodeActions } from './nodeActions.js';
import { createMapAuthoring } from './mapAuthoring.js';
import { createMapTravel } from './mapTravel.js';
import { resyncMapViews } from './mapResync.js';
import { el, mustGetElement } from '../ui/dom.js';
import { mountBreadcrumb } from '../ui/Breadcrumb.js';
import { mountWorldTree } from '../ui/WorldTree.js';
import { mountPalettePanel } from '../ui/PalettePanel.js';
import { mountMapControls } from '../ui/MapControls.js';
import { mountTileTooltip } from '../ui/TileTooltip.js';
import { mountExitList } from '../ui/ExitList.js';
import { wireTabs } from '../ui/Tabs.js';
import { isDefeated } from '../entities/Creature.js';
import { isGM } from '../view/ViewRole.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/map.js').MapNode} MapNode */

/**
 * MapEnv is the mutable context shared between the map wiring and its two
 * gesture modules, mapAuthoring and mapTravel. It holds the mounted views and
 * the Build and Play UI state.
 *
 * Wiring sets the view fields in mount order. The gesture handlers only run
 * on user events, long after wiring completes, so reading the fields late is
 * safe. mapControls and nodeActions already rely on the same late binding.
 * `mapResync.js`'s resyncMapViews depends on the same rule: it reads
 * mapCanvas, breadcrumb, worldTree, and regionTree from this object instead
 * of the local variables. Do not call resyncMapViews, goToNode, resyncMap, or
 * a node action while wireMapView still runs.
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
 *   syncExits: () => void,
 *   syncPaletteKind: () => void,
 *   refreshMapDescription: () => void,
 *   snapshotEdit: (...nodes: MapNode[]) => void,
 * }} MapEnv
 */

/**
 * Wires everything on and around the map: the canvas and its stroke and click
 * gestures, the breadcrumb, both world trees, the tile inspector, the palette
 * and its drag and drop, the fog controls, the screen-reader map description,
 * stroke-level undo, and the Build-rail tools (Undo stroke, Export PNG).
 *
 * This function owns the mounts and the location-sync actions. The
 * Build-mode authoring gestures live in mapAuthoring.js. The Play-mode
 * movement lives in mapTravel.js. Both share state through the returned
 * MapEnv object, so wireGenerateAction can also use it.
 * @param {AppContext} app
 * @returns {MapEnv}
 */
export function wireMapView(app) {
  const { palette, grid, navigator, partyTracker, toasts, state } = app;

  const canvasEl = /** @type {HTMLCanvasElement} */ (mustGetElement('map-canvas'));

  // The Build rail's tab strip (Paint, Tile, Encounters) keeps the rail one
  // screen tall instead of stacking every card. Selecting a tile jumps to the
  // Tile tab below. A user drives every other tab change.
  const buildTabs = wireTabs(mustGetElement('build-tabs'));
  // The Encounters tab's nested Mobs and NPCs strip splits the two rosters.
  wireTabs(mustGetElement('build-encounter-tabs'));

  // The gesture modules read this shared context. Each view field is
  // assigned below, as its mount completes.
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
      syncExits,
      syncPaletteKind,
      refreshMapDescription,
    })
  );

  const authoring = createMapAuthoring(app, env);
  const travel = createMapTravel(app, env);
  const nodeActions = createNodeActions(app, env);
  env.nodeActions = nodeActions;
  env.snapshotEdit = authoring.snapshotEdit;
  app.actions.undoStroke = authoring.undoStroke;
  app.actions.meetCreatures = travel.meetCreaturesHere;

  /** Show the party marker only on the node where the party stands. Resolve
   * each character's named token for the node in view: their own location, or
   * the party's tile if the character still travels with the party.
   * When the split-party toggle is off, everyone moves together. The
   * individual named tokens stay hidden, and only the shared party marker
   * draws. */
  function syncPartyMarker() {
    const position = partyTracker.getPosition();
    const nodeId = navigator.getCurrentNode().id;
    mapCanvas.setPartyTile(position.nodeId === nodeId ? position.tileId : null);
    mapCanvas.setCharacterTokens(
      state.splitParty ? characterTokens(state.characters, position, nodeId) : [],
    );
    syncCreatureMarkers();
    syncExits();
    refreshMapDescription();
  }
  app.actions.syncPartyMarker = syncPartyMarker;

  /** Recompute the ways out of the node in view and pass them to both places
   * that show them: the canvas, which draws an arrow for each side and a
   * badge for each door, and the exit buttons, which let a keyboard or a
   * screen reader use an exit.
   * syncPartyMarker calls this function. Every path that changes the node in
   * view already calls syncPartyMarker: navigation, a zoom-in, and a resync.
   * resyncMapViews also calls this function for the redraw path, which skips
   * the party marker on purpose. The mode switch calls it too, because Build
   * mode offers no ways out.
   *
   * Build's authoring warning runs alongside this function. It answers the
   * same question about the same node, but from the node itself, not from the
   * Play-only exit list, which is empty while authoring. */
  function syncExits() {
    const exits = travel.currentExits();
    mapCanvas.setExits(exits);
    exitList?.update(exits);
    syncBuildWarning();
    // The tree's warning badges answer the same question for every node. A
    // stroke on the node in view can seal or unseal a child node without
    // changing the warning of the node itself, so the rail warning check
    // above cannot replace this update. The tree skips its update when the
    // signature stays the same.
    env.worldTree?.update();
  }

  // This element stays in the document with no text, instead of being added
  // only when there is a message. A screen reader can miss a live region that
  // arrives together with its content. CSS hides the element when it is empty.
  const buildWarning = mustGetElement('build-warning');
  let lastBuildWarning = '';

  /** Tell the GM when nothing in the parent map leads to the node in view, or
   * when an interior has no painted way out. Play mode always offers a
   * fallback exit, so both warnings point to an unfinished map. The Build
   * rail that shows them stays hidden everywhere else. */
  function syncBuildWarning() {
    const node = navigator.getCurrentNode();
    const parent = grid.getParent(node);
    const text = authoringWarning(node, parent) ?? '';
    // This follows the same reasoning as refreshMapDescription. This element
    // is a live region, and syncExits runs on every party step and every
    // paint stroke. An unconditional write re-announces an unchanged
    // sentence each time.
    if (text === lastBuildWarning) return;
    lastBuildWarning = text;
    buildWarning.textContent = text;
  }

  /** @type {ReturnType<typeof mountExitList> | null} assigned after the viewport mounts */
  let exitList = null;

  /** Mark the tiles of the current node that hold a placed creature: the
   * danger marker for a live, undefeated hostile, and the distinct blue
   * marker for everyone else. The map shows both once the party comes
   * within detection range. One pass covers both layers, and it refreshes
   * both Build-rail authoring lists, which show the same node scope. */
  function syncCreatureMarkers() {
    const nodeId = navigator.getCurrentNode().id;
    const placed = state.creatures.filter((c) => c.location && c.location.nodeId === nodeId);
    /** @param {import('../types/creature.js').Creature} c */
    const tileOf = (c) =>
      /** @type {import('../types/entities.js').EncounterLocation} */ (c.location).tileId;
    mapCanvas.setEncounterTiles(
      placed.filter((c) => c.disposition === 'hostile' && !isDefeated(c)).map(tileOf),
    );
    mapCanvas.setNPCTiles(placed.filter((c) => c.disposition !== 'hostile').map(tileOf));
    app.views.buildFoes.update();
    app.views.buildNPCs.update();
  }
  app.actions.syncCreatureMarkers = syncCreatureMarkers;

  let lastDescription = '';

  /** Re-narrate the current map for the screen-reader live region. Call this
   * wherever the node, the party, the fog, or the tiles change, the same
   * events that redraw the map. */
  function refreshMapDescription() {
    const text = describeNode(navigator.getCurrentNode(), partyTracker.getPosition(), {
      revealAll: state.mode === 'build',
    });
    // Write only when the narration changes. Assigning textContent replaces
    // the live region's text node, and a screen reader watches that node. An
    // unconditional write re-announces the whole description even when no
    // word changed, for example on a paint stroke that only swaps tile art,
    // or a party step inside an already-explored area.
    if (text === lastDescription) return;
    lastDescription = text;
    mapDescription.textContent = text;
  }
  app.actions.refreshMapDescription = refreshMapDescription;

  /**
   * Navigate to a node by id and resync every view that reflects the location.
   * @param {string} nodeId
   */
  function goToNode(nodeId) {
    // A fog brush works only on the node where the GM picked it up. If the GM
    // carries it into another node, the next click paints fog there instead
    // of moving the party. Only a pressed icon explains why.
    setFogTool(null);
    navigator.goTo(nodeId);
    resyncMapViews(app, env, { reframe: true });
  }

  /**
   * Pick up or put down a Play-mode fog brush. A brush takes over the left
   * mouse button through the authoring gesture. The GM must be able to see
   * this mode and leave it: the canvas gets a class for the crosshair cursor
   * while a brush is held, and Escape drops the brush, as does navigating
   * away. Build mode always keeps the authoring gesture on and has no fog
   * brush of its own.
   * @param {'reveal' | 'hide' | null} tool
   */
  function setFogTool(tool) {
    const next = state.mode === 'play' ? tool : null;
    env.fogTool = next;
    mapCanvas.setAuthoring(state.mode === 'build' || next !== null);
    canvasEl.classList.toggle('is-fog-brush', next !== null);
    mapControls?.update();
  }

  // Re-read the node in view and every location view from the grid. Use this
  // for a caller that replaced the world underneath the tab. The node object,
  // the party marker, the breadcrumb, and both trees all derive from grid
  // content that this tab did not change itself.
  app.actions.resyncMap = () => goToNode(navigator.currentNodeId);

  /** Show only the palette terrain that the current node's kind can use. */
  function syncPaletteKind() {
    palettePanel.setKind(navigator.getCurrentNode().kind);
  }

  /** Remove any Build-mode tile selection and its inspector and canvas
   * highlight. */
  function clearSelection() {
    env.selectedTileId = null;
    mapCanvas.setSelectedTile(null);
    inspector.setTile(null);
  }
  app.actions.getSelectedTileId = () => env.selectedTileId;

  /**
   * Select a tile within the current node and point the inspector at it.
   * Bring the Tile tab forward so the inspector is visible.
   * @param {string} tileId
   */
  function selectTile(tileId) {
    env.selectedTileId = tileId;
    mapCanvas.setSelectedTile(tileId);
    inspector.setTile(getTile(navigator.getCurrentNode(), tileId) ?? null, true);
    buildTabs.select('build-tab-tile');
  }

  /**
   * Bring a staged location into view. Navigate to its node if the GM looks
   * elsewhere, center the canvas on its tile, and select the tile so it
   * shows highlighted. Unlike selectTile, this does not change the Build
   * rail's active tab. This is how a click on an encounter in the Build list
   * lands on the encounter.
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

  /**
   * Bring a position into view without changing the Build-mode tile
   * selection. Navigate to its node when the view looks elsewhere, then
   * center the canvas on the tile at the current zoom. This is how selecting
   * a character in the roster follows the character around a split party.
   * @param {import('../types/entities.js').EncounterLocation} location
   */
  function centerOnLocation(location) {
    if (navigator.getCurrentNode().id !== location.nodeId) {
      if (!grid.getNode(location.nodeId)) return;
      goToNode(location.nodeId);
    }
    mapCanvas.centerOnTile(location.tileId);
  }
  app.actions.centerOnLocation = centerOnLocation;

  const breadcrumb = mountBreadcrumb(mustGetElement('breadcrumb-container'), goToNode);
  env.breadcrumb = breadcrumb;

  const worldTree = mountWorldTree(mustGetElement('world-tree-container'), {
    getNodes: () => [...grid.nodes.values()],
    getCurrentId: () => navigator.getCurrentNode().id,
    onSelect: goToNode,
    onAddChild: (id) => nodeActions.addChildNode(id),
    onEdit: (id) => nodeActions.editNode(id),
    onDelete: (id) => nodeActions.deleteNode(id),
    // Badge every unreachable or sealed node. Unlinking a tile flags the
    // orphaned child node here, instead of only when the GM next views it.
    // This check runs in Build mode only: the tree sits in a Build-only rail.
    // Adding the check to the signature costs a world scan on every
    // Play-mode party step.
    getWarning: (node) =>
      state.mode === 'build' ? authoringWarning(node, grid.getParent(node)) : null,
  });
  env.worldTree = worldTree;

  // The Play-mode counterpart to the Build-mode world tree. It shows the same
  // hierarchy, but read-only, with no add or delete controls. A player sees
  // only the nodes that the party has discovered, so unexplored regions stay
  // hidden from the table. The GM always sees the whole world. Selecting a
  // node offers to teleport the party there.
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

  /** @type {{ update: () => void } | null} assigned after mapCanvas exists */
  let mapControls = null;

  const mapCanvas = new MapCanvas(canvasEl, palette, {
    tileSize: 48,
    // Encounter, NPC, and point-of-interest markers appear out to twice the
    // fog reveal radius around the party, and around any split-off
    // character, and no further.
    markerRange: partyTracker.revealRadius * 2,
    getNodeName: (nodeId) => grid.getNode(nodeId)?.name,
    onViewChange: () => mapControls?.update(),
    onCellHover: travel.onCellHover,
    onStrokeCell: authoring.onStrokeCell,
    onStrokeEnd: authoring.onStrokeEnd,
    // A GM right-click in Build mode, without a drag into a pan, selects the
    // cell and opens the encounter context dialog for it. Encounter authoring
    // lives in encounterWiring.js. The action is late-bound, like the rest of
    // app.actions.
    onCellContextMenu: (x, y, _tile, clientX, clientY) => {
      if (state.mode !== 'build' || !isGM(state.role)) return;
      selectTile(tileIdAt(x, y));
      app.actions.openEncounterContextMenu(x, y, clientX, clientY);
    },
    onCellClick: travel.onCellClick,
    onExitClick: travel.exitToParent,
    // A cursor key pressed toward a border that leads out arms the exit. The
    // same arrow key again takes the exit. This message is narrated apart
    // from the map description, which a node change rewrites completely.
    onExitArmed: (exit) => {
      exitPrompt.textContent = exit
        ? `Press the same arrow again to return to ${exit.targetName}.`
        : '';
    },
  });
  app.views.mapCanvas = mapCanvas;
  env.mapCanvas = mapCanvas;

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
    // GM fog controls, hidden from the player role by CSS. Brushes stroke fog
    // on or off. Reveal-all lights the whole current node.
    fog: {
      getTool: () => env.fogTool,
      onToolChange: setFogTool,
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

  // Escape puts a held fog brush down, the same way it dismisses a dialog.
  // The brush silently owns the left mouse button, so a key must give it back.
  canvasEl.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !env.fogTool) return;
    event.preventDefault();
    setFogTool(null);
    toasts.show('Fog brush put down.');
  });

  // The keyboard and screen-reader path to the canvas-drawn return arrows.
  // This is the only control for the fallback exit.
  exitList = mountExitList(mustGetElement('map-viewport'), travel.exitToParent);

  // A visually hidden live region that narrates the map canvas for screen
  // readers. The canvas pixels are opaque to assistive technology.
  // aria-live="polite" announces an update without an interruption.
  const mapDescription = el('div', 'sr-only');
  mapDescription.setAttribute('role', 'status');
  mapDescription.setAttribute('aria-live', 'polite');
  mustGetElement('map-viewport').appendChild(mapDescription);

  // This is its own region, not a line in mapDescription. The arming prompt
  // comes and goes with single keystrokes. Sharing mapDescription's region,
  // refreshMapDescription's write-if-changed check either overwrites the
  // prompt or re-announces the whole map.
  const exitPrompt = el('div', 'sr-only');
  exitPrompt.setAttribute('role', 'status');
  exitPrompt.setAttribute('aria-live', 'polite');
  mustGetElement('map-viewport').appendChild(exitPrompt);

  // The map-facing effects of a mode switch. sessionControls calls this
  // after it flips the body classes.
  app.actions.onModeChanged = (mode) => {
    mapCanvas.setRevealAll(mode === 'build');
    tileTooltip.hide();
    env.regionAnchor = null;
    // The fog brush is a Play-mode tool. Changing modes drops it. Putting it
    // down settles the authoring gesture and the crosshair for the new mode.
    setFogTool(null);
    if (mode !== 'build') clearSelection();
    // The warning text is written into a rail that only Build mode shows. A
    // sentence set while the rail stayed hidden is never announced. Resetting
    // it makes entering Build mode write it again, where the GM can read it.
    lastBuildWarning = '';
    syncExits(); // Build mode offers no ways out. Play mode draws them again.
    worldTree.update();
    regionTree.update();
    refreshMapDescription();
  };

  // This handles a role switch in the same way. A player role gets no fog
  // brush and no authoring gesture. An open tooltip can now show too much.
  app.actions.onRoleChanged = (role) => {
    if (role === 'player') setFogTool(null);
    tileTooltip.hide();
    // The sidebar world tree shows everything to the GM, but shows only
    // discovered nodes to a player. A role flip changes its contents.
    regionTree.update();
  };

  // Keep the canvas buffer matched to the CSS size of the element, times the
  // device pixel ratio. This lets the map fill the fluid layout column,
  // instead of staying a fixed 720x540 island. Each resize re-frames the node.
  const resizeMapToViewport = () => {
    const dpr = window.devicePixelRatio || 1;
    mapCanvas.resize(
      Math.max(1, Math.round(canvasEl.clientWidth * dpr)),
      Math.max(1, Math.round(canvasEl.clientHeight * dpr)),
    );
  };
  new ResizeObserver(resizeMapToViewport).observe(canvasEl);

  // Build-rail map tools: stroke-level undo, and a fog-free PNG export of the
  // current node. These live in the Build rail, so only the GM in Build mode
  // sees them. A player never sees these tools.
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

  return env;
}
