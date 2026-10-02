import { getTile } from '../map/TileGrid.js';
import { createBuildWarning, mountMapNarration } from './mapNarration.js';
import { tileIdAt } from '../map/MapGeometry.js';
import { MapCanvas } from '../map/MapCanvas.js';
import { discoveredNodes } from '../map/FogOfWar.js';
import { characterTokens, followedPosition } from '../party/CharacterTokens.js';
import { ancestorMarkerTile } from '../map/AncestorMarker.js';
import { authoringWarning } from '../map/MapExits.js';
import { createNodeActions } from './nodeActions.js';
import { createMapAuthoring } from './mapAuthoring.js';
import { createMapTravel } from './mapTravel.js';
import { resyncMapViews } from './mapResync.js';
import { mountMapChrome } from './mapChrome.js';
import { wireMapBuildTools } from './mapBuildTools.js';
import { mustGetElement } from '../ui/dom.js';
import { mountBreadcrumb } from '../ui/Breadcrumb.js';
import { mountWorldTree } from '../ui/WorldTree.js';
import { mountPalettePanel } from '../ui/PalettePanel.js';
import { mountTileTooltip } from '../ui/TileTooltip.js';
import { mountExitList } from '../ui/ExitList.js';
import { wireTabs } from '../ui/Tabs.js';
import { mountBuildToolChip } from '../ui/BuildToolChip.js';
import { PAINT_TAB, effectiveBrush, toolChipLabel } from '../view/BuildTool.js';
import { isDefeated } from '../entities/Creature.js';
import { isGM, seesThroughFog } from '../view/ViewRole.js';
import { hiddenHandoutTiles } from '../handout/Handouts.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/mapEnv.js').MapEnv} MapEnv */

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
  let buildTab = PAINT_TAB;
  // The tool chip mounts with the map toolbar below.
  let syncToolChip = () => {};
  // The empty-map card mounts with the Build tools below.
  let syncEmptyMap = () => {};
  const buildTabs = wireTabs(mustGetElement('build-tabs'), {
    onSelect: (id) => {
      buildTab = id;
      syncToolChip();
    },
  });
  // The Encounters tab's nested Mobs and NPCs strip splits the two rosters.
  wireTabs(mustGetElement('build-encounter-tabs'));

  // The gesture modules read this shared context. Each view field is
  // assigned below, as its mount completes.
  const env = /** @type {MapEnv} */ (
    /** @type {unknown} */ ({
      selectedTileId: null, // tile id selected for inspection/editing in Build mode
      activeBrush: null, // active Build-mode paint brush
      get buildTab() {
        return buildTab;
      },
      fogTool: null, // active Play-mode GM fog brush
      syncBuildTool: () => syncToolChip(),
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
  env.recordEdit = authoring.recordEdit;
  env.finishEdit = authoring.finishEdit;
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
    const shown = navigator.getCurrentNode();
    const nodeId = shown.id;
    // On a map above the party, as the breadcrumb shows it, the marker sits
    // on the tile that leads down to where the party stands.
    const ancestorTile =
      position.nodeId === nodeId
        ? null
        : ancestorMarkerTile(grid.getBreadcrumb(position.nodeId), shown);
    mapCanvas.setPartyTile(
      position.nodeId === nodeId ? position.tileId : ancestorTile,
      position.nodeId === nodeId,
    );
    const followed = followedView();
    // Build mode frames the whole map from its top-left corner instead of
    // the party, so the mini-map does not cover the first rows and columns.
    mapCanvas.setFocusTile(
      state.mode === 'build' ? null : followed.nodeId === nodeId ? followed.tileId : ancestorTile,
    );
    mapCanvas.setCharacterTokens(
      state.splitParty ? characterTokens(state.characters, position, nodeId) : [],
    );
    syncCreatureMarkers();
    syncExits();
    refreshMapDescription();
  }
  app.actions.syncPartyMarker = syncPartyMarker;
  app.actions.syncExits = syncExits;

  /** Where this tab's view follows: the party, or a bound player's own
   * character while the party is split. */
  function followedView() {
    const boundId = isGM(state.role) ? null : app.actions.getBoundCharacterId();
    return followedPosition(state.characters, partyTracker.getPosition(), boundId);
  }

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
    const shown = travel.shownExits(exits);
    mapCanvas.setExits(shown, exits);
    exitList?.update(shown);
    // The mini-map marks the same parent block the exits come from, and every
    // path that can move the party, change the node in view, or repaint the
    // parent runs this function.
    miniMap?.update();
    buildWarning.sync();
    // The tree's warning badges answer the same question for every node. A
    // stroke on the node in view can seal or unseal a child node without
    // changing the warning of the node itself, so the rail warning check
    // above cannot replace this update. The tree skips its update when the
    // signature stays the same.
    env.worldTree?.update();
  }

  // "Link from <parent>" opens the parent on the Paint tab with the Region
  // brush set to the node, so the next stroke there links it.
  const buildWarning = createBuildWarning(app, (parentId, childId) => {
    goToNode(parentId);
    buildTabs.select(PAINT_TAB);
    env.palettePanel?.useRegion(childId);
    app.toasts.show(
      `Paint tiles on ${grid.getNode(parentId)?.name ?? 'the parent map'} to link them to ${grid.getNode(childId)?.name ?? 'this map'}.`,
    );
  });

  /** @type {ReturnType<typeof mountExitList> | null} assigned after the viewport mounts */
  let exitList = null;

  /** Mark the tiles of the current node that hold a placed creature: the
   * danger marker for a live, undefeated hostile, and the distinct blue
   * marker for everyone else. The map shows both once the party comes
   * within detection range. The same pass sets the GM's badges for tiles
   * with a hidden handout. One pass covers every layer. It also refreshes
   * both Build-rail authoring lists, which show the same node scope, but only
   * while Build mode shows them. Play mode fights change creatures many
   * times a round, and a hidden list rebuild on each change is wasted work.
   * Entering Build mode runs the sync again so the lists catch up. */
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
    mapCanvas.setHandoutTiles(isGM(state.role) ? hiddenHandoutTiles(state.handouts, nodeId) : []);
    if (state.mode !== 'build') return;
    app.views.buildFoes.update();
    app.views.buildNPCs.update();
  }
  app.actions.syncCreatureMarkers = syncCreatureMarkers;

  /** @type {ReturnType<typeof mountMapNarration> | null} assigned after the viewport mounts */
  let narration = null;

  /** Re-narrate the current map for the screen-reader live region. */
  function refreshMapDescription() {
    narration?.refresh();
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
  // content that this tab did not change itself. An adopted save arrives on
  // every GM autosave and every combat flush. While the canvas still shows
  // the same node at the same size, it redraws in place, so the pan, zoom,
  // keyboard cursor, and a held fog brush stay. A new node, or a resize that
  // can drop the cells under the cursor, re-frames.
  app.actions.resyncMap = () => {
    const shown = mapCanvas.node;
    const next = navigator.getCurrentNode();
    if (
      shown &&
      shown.id === next.id &&
      shown.width === next.width &&
      shown.height === next.height
    ) {
      resyncMapViews(app, env);
      syncPartyMarker();
    } else {
      goToNode(navigator.currentNodeId);
    }
  };

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

  // A Player tab gets an empty Build-rail tree. The rail is hidden in that
  // role, but a filled tree would still put the name of every node, such as
  // an undiscovered dungeon, into the page for anyone who reads the DOM.
  const worldTree = mountWorldTree(mustGetElement('world-tree-container'), {
    getNodes: () => (isGM(state.role) ? [...grid.nodes.values()] : []),
    getCurrentId: () => navigator.getCurrentNode().id,
    onSelect: goToNode,
    // The new map opens at once, and the tree opens the rows above it and
    // selects its row, so the GM sees where it went.
    onAddChild: async (id) => {
      const child = await nodeActions.addChildNode(id);
      if (child) goToNode(child);
    },
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
  });
  app.views.regionTree = regionTree;
  env.regionTree = regionTree;

  /** @type {ReturnType<typeof import('../ui/MapControls.js').mountMapControls> | null} assigned after mapCanvas exists */
  let mapControls = null;
  /** @type {ReturnType<typeof import('../ui/MiniMap.js').mountMiniMap> | null} assigned after mapCanvas exists */
  let miniMap = null;

  const mapCanvas = new MapCanvas(canvasEl, palette, {
    tileSize: 48,
    // Encounter, NPC, and point-of-interest markers appear out to twice the
    // fog reveal radius around the party, and around any split-off
    // character, and no further.
    markerRange: partyTracker.revealRadius * 2,
    getNodeName: (nodeId) => grid.getNode(nodeId)?.name,
    onViewChange: () => {
      mapControls?.update();
      syncEmptyMap();
    },
    onCellHover: travel.onCellHover,
    onStrokeCell: authoring.onStrokeCell,
    onStrokeEnd: authoring.onStrokeEnd,
    // A GM right-click in Build mode, without a drag into a pan, selects the
    // cell and opens the encounter context dialog for it. Encounter authoring
    // lives in encounterPanels.js. The action is late-bound, like the rest of
    // app.actions.
    onCellContextMenu: (x, y, _tile, clientX, clientY) => {
      if (state.mode !== 'build' || !isGM(state.role)) return;
      selectTile(tileIdAt(x, y));
      app.actions.openEncounterContextMenu(x, y, clientX, clientY);
    },
    onCellClick: travel.onCellClick,
    onExitClick: travel.exitToParent,
    // A cursor key pressed toward a border that leads out arms the exit. The
    // same arrow key again takes the exit.
    onExitArmed: (exit) => narration?.exitArmed(exit),
    // The map description is about the node and the party, and a cursor move
    // changes neither.
    onCursorMove: (tileId) => narration?.cursorMoved(tileId),
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
      syncToolChip();
    },
    tileTooltip,
    {
      list: () =>
        grid.getChildren(navigator.currentNodeId).map((n) => ({ id: n.id, name: n.name })),
      create: () => env.nodeActions.addChildNode(navigator.currentNodeId),
    },
  );
  env.palettePanel = palettePanel;

  authoring.wireCanvasDrop(canvasEl);

  const chrome = mountMapChrome(app, env, {
    canvasEl,
    followedView,
    centerOnLocation,
    setFogTool,
    entryThrough: travel.entryThrough,
  });
  miniMap = chrome.miniMap;
  mapControls = chrome.mapControls;
  const { syncMapOccluders } = chrome;
  const toolChip = mountBuildToolChip(mapControls.element, () => {
    const region = grid.getNode(palettePanel.regionPicker.getTarget() ?? '');
    return toolChipLabel(effectiveBrush(env.activeBrush, buildTab), region?.name ?? null);
  });
  // While the Region brush paints, the map draws the blocks of its target
  // region with emphasis, so the GM sees which cells already link there.
  syncToolChip = () => {
    toolChip.sync();
    const painting =
      state.mode === 'build' && effectiveBrush(env.activeBrush, buildTab) === 'region';
    mapCanvas.setHighlightRegion(painting ? palettePanel.regionPicker.getTarget() : null);
  };
  palettePanel.regionPicker.root.addEventListener('change', syncToolChip);

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

  narration = mountMapNarration(app, mapCanvas);

  // A GM in Play mode sees the art under the fog, dimmed. A player sees solid
  // fog, so the screen the players watch shows nothing ahead.
  const syncFogDim = () => mapCanvas.setFogDim(seesThroughFog(state.mode, state.role));
  syncFogDim();

  // The map-facing effects of a mode switch. sessionControls calls this
  // after it flips the body classes.
  app.actions.onModeChanged = (mode) => {
    mapCanvas.setRevealAll(mode === 'build');
    syncFogDim();
    syncMapOccluders();
    // A Play view frames the revealed tiles, at a zoom that can cut off the
    // rest of the map. Build mode edits the whole map, so it fits it.
    if (mode === 'build') {
      mapCanvas.fit();
      palettePanel.show();
    }
    syncToolChip();
    tileTooltip.hide();
    // The fog brush is a Play-mode tool. Changing modes drops it. Putting it
    // down settles the authoring gesture and the crosshair for the new mode.
    setFogTool(null);
    if (mode !== 'build') clearSelection();
    buildWarning.reset();
    // Build mode offers no ways out, and it drops the party focus of the fit.
    // Play mode draws the exits again.
    syncPartyMarker();
    worldTree.update();
    regionTree.update();
    refreshMapDescription();
    // Play mode is about the party. Bring it into view, from whatever node
    // Build had open.
    if (mode === 'play') {
      const at = followedView();
      if (navigator.getCurrentNode().id !== at.nodeId && grid.getNode(at.nodeId)) {
        goToNode(at.nodeId);
      } else mapCanvas.bringTileIntoView(at.tileId);
    }
  };

  // This handles a role switch in the same way. A player role gets no fog
  // brush and no authoring gesture. An open tooltip can now show too much.
  app.actions.onRoleChanged = (role) => {
    if (role === 'player') setFogTool(null);
    syncFogDim();
    tileTooltip.hide();
    // The sidebar world tree shows everything to the GM, but shows only
    // discovered nodes to a player. The Build-rail tree is empty for a
    // player. A role flip changes the contents of both.
    regionTree.update();
    worldTree.update();
  };

  // Keep the canvas buffer matched to the CSS size of the element, times the
  // device pixel ratio. This lets the map fill the fluid layout column,
  // instead of staying a fixed 720x540 island. Each resize re-frames the node.
  // Combat and Library mode hide the map with display: none, which reports a
  // size of zero. The buffer keeps its size while hidden, so the pan and zoom
  // of the GM come back unchanged when the map shows again.
  const resizeMapToViewport = () => {
    if (canvasEl.clientWidth === 0 || canvasEl.clientHeight === 0) return;
    const dpr = window.devicePixelRatio || 1;
    mapCanvas.resize(
      Math.max(1, Math.round(canvasEl.clientWidth * dpr)),
      Math.max(1, Math.round(canvasEl.clientHeight * dpr)),
    );
    syncMapOccluders();
  };
  new ResizeObserver(resizeMapToViewport).observe(canvasEl);

  syncEmptyMap = wireMapBuildTools(app, env, authoring.undoStroke, buildTabs).syncEmptyMap;

  mapCanvas.setNode(navigator.getCurrentNode());
  syncPartyMarker();
  syncPaletteKind();
  breadcrumb.update(navigator.getBreadcrumb());

  return env;
}
