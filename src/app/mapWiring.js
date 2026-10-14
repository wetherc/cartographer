import { createBuildWarning, mountMapNarration } from './mapNarration.js';
import { tileIdAt } from '../map/MapGeometry.js';
import { MapCanvas } from '../map/MapCanvas.js';
import { characterTokens, followedPosition } from '../party/CharacterTokens.js';
import { ancestorMarkerTile } from '../map/AncestorMarker.js';
import { plateName } from '../map/NodeLock.js';
import { createNodeActions } from './nodeActions.js';
import { createMapAuthoring } from './mapAuthoring.js';
import { createMapTravel } from './mapTravel.js';
import { createMapSelection } from './mapSelection.js';
import { mountMapTrees } from './mapTrees.js';
import { wireMapModes, wireBuildRailMount } from './mapModes.js';
import { resyncMapViews } from './mapResync.js';
import { mountMapChrome } from './mapChrome.js';
import { wireMapBuildTools } from './mapBuildTools.js';
import { mustGetElement } from '../ui/dom.js';
import { mountTileTooltip } from '../ui/TileTooltip.js';
import { mountExitList } from '../ui/ExitList.js';
import { wireTabs } from '../ui/Tabs.js';
import { mountBuildToolChip } from '../ui/BuildToolChip.js';
import { PAINT_TAB, effectiveBrush, toolChipLabel } from '../view/BuildTool.js';
import { isTilePickWaiting } from './mapPick.js';
import { isDefeated } from '../entities/Creature.js';
import { isGM } from '../view/ViewRole.js';
import { hiddenHandoutTiles } from '../handout/Handouts.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/mapEnv.js').MapEnv} MapEnv */

/**
 * Wires everything on and around the map: the canvas and its stroke and click
 * gestures, the breadcrumb, both world trees, the tile inspector, the palette
 * and its drag and drop, the fog controls, the screen-reader map description,
 * stroke-level undo and redo, and the Build tools (the header Undo stroke
 * and Redo stroke buttons, and Export PNG).
 *
 * This function owns the mounts and the location-sync actions. The
 * Build-mode authoring gestures live in mapAuthoring.js. The Play-mode
 * movement lives in mapTravel.js. Both share state through the returned
 * MapEnv object, so wireGenerateAction can also use it. The tile selection
 * is in mapSelection.js, the breadcrumb and both trees mount from
 * mapTrees.js, and the mode and role switch effects and the Build rail
 * mount are in mapModes.js.
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
  // The Encounters tab's nested Foes and NPCs strip splits the two rosters.
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
      syncPartyMarker,
      syncExits,
      syncPaletteKind,
      refreshMapDescription,
    })
  );

  const { clearSelection, selectTile, focusLocation, centerOnLocation } = createMapSelection(
    app,
    env,
    buildTabs,
  );
  env.selectTile = selectTile;
  env.clearSelection = clearSelection;
  app.actions.getSelectedTileId = () => env.selectedTileId;
  app.actions.focusLocation = focusLocation;
  app.actions.centerOnLocation = centerOnLocation;

  const authoring = createMapAuthoring(app, env);
  const travel = createMapTravel(app, env);
  const nodeActions = createNodeActions(app, env);
  env.nodeActions = nodeActions;
  env.snapshotEdit = authoring.snapshotEdit;
  env.recordEdit = authoring.recordEdit;
  env.finishEdit = authoring.finishEdit;
  env.pruneEdits = authoring.pruneEdits;
  app.actions.undoStroke = authoring.undoStroke;
  app.actions.redoStroke = authoring.redoStroke;
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
    env.palettePanel?.setKind(navigator.getCurrentNode().kind);
  }

  mountMapTrees(app, env, travel.teleportToNode);
  const { breadcrumb } = env;

  /** @type {ReturnType<typeof import('../ui/MapControls.js').mountMapControls> | null} assigned after mapCanvas exists */
  let mapControls = null;
  /** @type {ReturnType<typeof import('../ui/MiniMap.js').mountMiniMap> | null} assigned after mapCanvas exists */
  let miniMap = null;

  // The Build-mode Place labels checkbox. mapBuildTools.js restores and
  // stores its state.
  const placeLabels = /** @type {HTMLInputElement} */ (mustGetElement('place-labels-toggle'));
  const mapCanvas = new MapCanvas(canvasEl, palette, {
    tileSize: 48,
    // Encounter, NPC, and point-of-interest markers appear out to twice the
    // fog reveal radius around the party, and around any split-off
    // character, and no further.
    markerRange: partyTracker.revealRadius * 2,
    // Build mode marks a locked map on its region plate, or shows no plate
    // while Place labels is off. Play mode shows the plain name, because a
    // Player tab sees the same plates.
    getNodeName: (nodeId) => {
      if (state.mode !== 'build') return grid.getNode(nodeId)?.name;
      return placeLabels.checked ? plateName(grid.getNode(nodeId)) : undefined;
    },
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
    onCursorStroke: (tileId, before) => narration?.cursorStroked(tileId, before),
  });
  app.views.mapCanvas = mapCanvas;
  env.mapCanvas = mapCanvas;

  env.inspector = authoring.mountInspector(mustGetElement('inspector-container'));

  env.tileTooltip = mountTileTooltip(document.body);

  env.palettePanel = null;

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
    const region = grid.getNode(env.palettePanel?.regionPicker.getTarget() ?? '');
    const brush = effectiveBrush(env.activeBrush, buildTab);
    return toolChipLabel(brush, region?.name ?? null, isTilePickWaiting());
  });
  app.actions.syncToolChip = () => syncToolChip();
  app.actions.goToNode = goToNode;
  // While the Link tool paints, the map draws the blocks of its target
  // region with emphasis, so the GM sees which cells already link there.
  syncToolChip = () => {
    toolChip.sync();
    const painting =
      state.mode === 'build' && effectiveBrush(env.activeBrush, buildTab) === 'region';
    mapCanvas.setHighlightRegion(
      painting ? (env.palettePanel?.regionPicker.getTarget() ?? null) : null,
    );
  };

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

  wireMapModes(app, env, {
    canvasEl,
    setFogTool,
    syncMapOccluders,
    followedView,
    resetBuildWarning: () => buildWarning.reset(),
  });

  syncEmptyMap = wireMapBuildTools(app, env, authoring, buildTabs).syncEmptyMap;
  wireBuildRailMount(app, env);

  mapCanvas.setNode(navigator.getCurrentNode());
  syncPartyMarker();
  syncPaletteKind();
  breadcrumb.update(navigator.getBreadcrumb());

  return env;
}
