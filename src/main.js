import { getTile, updateTileMetadata, createMapNode } from './map/TileGrid.js';
import { TilePalette } from './map/TilePalette.js';
import { MapCanvas } from './map/MapCanvas.js';
import { clientToBuffer, screenToTile } from './map/MapGeometry.js';
import { paintTile, eraseTile, erasePath, normalizeRect, tilesInRect, linkTilesInRect, ensureChildLink } from './map/TilePaint.js';
import { computeRegionEntryTile, resolveEntryTile } from './map/EntryPoint.js';
import { MapNavigator } from './map/MapNavigator.js';
import { generateNodeTiles, generateDungeonLevels, ARCHETYPES } from './map/MapGenerator.js';
import { discoveredNodes, revealAll, setTileRevealed } from './map/FogOfWar.js';
import { pushEdit, popEdit } from './map/EditHistory.js';
import { renderNodeToCanvas, downloadCanvasPNG, exportFilename } from './map/MapExport.js';
import { findRegionGroups } from './map/RegionGroups.js';
import { mulberry32 } from './util/Rng.js';
import { createNodeActions } from './app/nodeActions.js';
import {
  buildBlankCampaign,
  buildExampleCampaign,
  loadInitialCampaign,
} from './campaign/Campaigns.js';
import { mustGetElement } from './ui/dom.js';
import { mountBreadcrumb } from './ui/Breadcrumb.js';
import { mountModeSwitch } from './ui/ModeSwitch.js';
import { wireTabs } from './ui/Tabs.js';
import { mountRoleSwitch } from './ui/RoleSwitch.js';
import { isGM, hpBand } from './view/ViewRole.js';
import { mountWorldTree } from './ui/WorldTree.js';
import { mountTileInspector } from './ui/TileInspector.js';
import { mountPalettePanel } from './ui/PalettePanel.js';
import { mountMapControls } from './ui/MapControls.js';
import { mountMapDescription } from './ui/MapDescription.js';
import { mountTileTooltip } from './ui/TileTooltip.js';
import { promptModal, confirmModal, alertModal } from './ui/Modal.js';
import { generateDialog } from './ui/GenerateDialog.js';
import { mountToasts, queueToastAfterReload, flushQueuedToast } from './ui/Toast.js';
import { PartyTracker } from './party/PartyTracker.js';
import { createCharacter, withHP, withMana, shortRest, longRest, addXP } from './entities/Character.js';
import { advanceWatches, advanceToDawn, formatClock } from './time/GameClock.js';
import { mountTimePanel } from './ui/TimePanel.js';
import { createParticipant, startCombat, advanceTurn } from './combat/Initiative.js';
import { mountInitiativePanel } from './ui/InitiativePanel.js';
import { tickConditions } from './entities/Conditions.js';
import { createNPC, npcsAt, DISPOSITIONS } from './entities/NPC.js';
import { mountNPCPanel } from './ui/NPCPanel.js';
import { createEncounter, encountersAt, encountersOnTile, isDefeated, toTemplate, fromTemplate } from './entities/Encounter.js';
import { slugId, replaceById, removeById } from './entities/Roster.js';
import { mountCharacterRoster } from './ui/CharacterRoster.js';
import { mountCharacterSheet } from './ui/CharacterSheet.js';
import { mountInventoryPanel } from './ui/InventoryPanel.js';
import { mountEncounterPanel } from './ui/EncounterPanel.js';
import { mountDiceTray } from './ui/DiceTray.js';
import { mountTravelogPanel } from './ui/TravelogPanel.js';
import { appendEntry, createEntry } from './log/Travelogue.js';
import { mountQuestPanel } from './ui/QuestPanel.js';
import { createQuest, toggleQuestStatus } from './quest/Quests.js';
import { mountHandoutPanel } from './ui/HandoutPanel.js';
import { createHandout, toggleRevealed, handoutsAt } from './handout/Handouts.js';
import {
  buildState,
  saveToLocalStorage,
  loadFromLocalStorage,
  snapshotHistory,
  undoHistory,
  downloadState,
  readStateFromFile,
  onExternalSave,
} from './storage/SaveManager.js';

const palette = new TilePalette();

const initial = loadInitialCampaign();

const { grid } = initial;
let { characters, encounters } = initial;
/** @type {import('./types/log.js').LogEntry[]} auto-recorded party travelogue */
let travelog = initial.travelog;
/** @type {import('./types/quest.js').Quest[]} GM-authored quest/session log */
let quests = initial.quests;
/** @type {import('./types/time.js').GameClock} in-game day/watch clock */
let clock = initial.clock;
/** @type {import('./types/npc.js').NPC[]} non-combatant NPCs */
let npcs = initial.npcs;
/** @type {import('./types/handout.js').Handout[]} GM lore/read-aloud handouts */
let handouts = initial.handouts;
/** @type {import('./types/entities.js').EncounterTemplate[]} reusable encounter templates */
let bestiary = initial.bestiary;
/** @type {import('./types/combat.js').CombatState | null} running combat, transient (not persisted) */
let combat = null;
/** Monotonic counter making travelogue entry ids unique within a session. */
let logSeq = 0;

const toasts = mountToasts(document.body);

/** Whether the live campaign has mutations not yet written by Save. Drives the
 * Save-button indicator, the leave-page guard, and the external-sync prompt. */
let dirty = false;

/** @param {boolean} next */
function setDirty(next) {
  dirty = next;
  const saveBtn = document.getElementById('save-btn');
  if (saveBtn) {
    saveBtn.classList.toggle('btn--attention', dirty);
    saveBtn.textContent = dirty ? 'Save •' : 'Save';
  }
}

/** Mark the campaign as having unsaved changes. Called from every mutation. */
function markDirty() {
  if (!dirty) setDirty(true);
}

// Warn before closing/reloading a tab with unsaved changes. Intentional
// reload flows (Undo/Import/replace) clear the flag first, so they stay quiet.
window.addEventListener('beforeunload', (event) => {
  if (!dirty) return;
  event.preventDefault();
  event.returnValue = '';
});

/**
 * Record a travelogue event and refresh the panel. Ids combine the clock with
 * a session counter so two events in the same millisecond never collide.
 * @param {import('./types/log.js').LogEntryKind} kind
 * @param {string} message
 */
function logEvent(kind, message) {
  const now = Date.now();
  travelog = appendEntry(travelog, createEntry(`log-${now}-${logSeq++}`, kind, message, now));
  travelogPanel.update();
  markDirty();
}

/**
 * If the party's current tile holds a live encounter, announce it in a modal
 * over the map. The encounter isn't removed — a party that flees or ignores it
 * leaves it in the sidebar for the current node — so this is purely a "you walk
 * into something" alert. The readout respects the viewer role: the GM sees
 * exact HP, players see the coarse status band. Called after a real move, not
 * on initial render, so the app doesn't greet a fresh load with a popup.
 */
function maybeTriggerEncounter() {
  const position = partyTracker.getPosition();
  const here = encountersOnTile(encounters, position);
  if (here.length === 0) return;
  const node = grid.getNode(position.nodeId);
  const region = node ? node.name : position.nodeId;
  const gm = isGM(currentRole);
  const list = here
    .map((e) => (gm ? `${e.name} (${e.currentHP}/${e.maxHP})` : `${e.name} — ${hpBand(e.currentHP, e.maxHP)}`))
    .join(', ');
  alertModal(`${list} — here in ${region}, tile (${position.tileId}).`, {
    title: here.length > 1 ? 'Encounters!' : 'Encounter!',
    label: 'Continue',
  });
}

/** @type {'play' | 'build'} */
let currentMode = 'play';
/**
 * Viewer role, per-tab so a follower tab can be Player while the GM's tab is
 * GM. Persisted in sessionStorage (not localStorage, which is shared across
 * tabs and would fight the cross-tab save sync).
 * @type {import('./types/view.js').ViewRole}
 */
let currentRole = /** @type {any} */ (sessionStorage.getItem('campaign-builder:role')) || 'gm';
/** @type {string | null} tile id selected for inspection/editing in Build mode */
let selectedTileId = null;
/** @type {import('./ui/PalettePanel.js').Brush} active Build-mode paint brush */
let activeBrush = null;
/** @type {'reveal' | 'hide' | null} active Play-mode GM fog brush */
let fogTool = null;
/** @type {{ x: number, y: number } | null} first cell of an in-progress region-tool drag */
let regionAnchor = null;
/** @type {ReturnType<typeof createNodeActions>} create/edit/delete-node actions; assigned once the views they resync exist */
let nodeActions;

/**
 * Build-mode stroke-level undo: an in-memory ring of node snapshots taken
 * before each paint/erase stroke, region link, tile link, drop-paint, and
 * generate, so one bad edit is reversible without reloading a whole earlier
 * save. Session-only — the persisted Undo button stays the save-level story.
 * @type {import('./types/map.js').MapNode[][]}
 */
let editHistory = [];

/** Snapshot the given nodes' pre-edit state onto the stroke-undo ring.
 * @param {...import('./types/map.js').MapNode} nodes */
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
  mapCanvas.setNode(navigator.getCurrentNode());
  clearSelection();
  syncPartyMarker();
  worldTree.update();
  regionTree.update();
  refreshMapDescription();
  markDirty();
  toasts.show('Undid the last edit.');
}

/** @typedef {import('./types/entities.js').Character} Character */

const navigator = new MapNavigator(grid, initial.party.nodeId);
const partyTracker = new PartyTracker(grid, initial.party);

const breadcrumbContainer = mustGetElement('breadcrumb-container');
const canvasEl = /** @type {HTMLCanvasElement} */ (mustGetElement('map-canvas'));

/** Show the party marker only on the node the party is actually standing in. */
function syncPartyMarker() {
  const position = partyTracker.getPosition();
  mapCanvas.setPartyTile(position.nodeId === navigator.getCurrentNode().id ? position.tileId : null);
  syncEncounterMarkers();
  refreshMapDescription();
}

/** Mark the current node's tiles that carry a live (undefeated) encounter, so
 * the map shows where danger lies once its tile is revealed. */
function syncEncounterMarkers() {
  const nodeId = navigator.getCurrentNode().id;
  mapCanvas.setEncounterTiles(
    encounters
      .filter((e) => e.location && e.location.nodeId === nodeId && !isDefeated(e))
      .map((e) => /** @type {import('./types/entities.js').EncounterLocation} */ (e.location).tileId),
  );
}

/** Re-narrate the current map for the screen-reader live region. Called wherever
 * the node, party, fog, or tiles change (the same events that redraw). */
function refreshMapDescription() {
  mapDescription.update(navigator.getCurrentNode(), partyTracker.getPosition(), currentMode === 'build');
}

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

/** Show the palette only the terrain the current node's kind can use. */
function syncPaletteKind() {
  palettePanel.setKind(navigator.getCurrentNode().kind);
}

/** Drop any Build-mode tile selection and its inspector/canvas highlight. */
function clearSelection() {
  selectedTileId = null;
  mapCanvas.setSelectedTile(null);
  inspector.setTile(null);
}

const breadcrumb = mountBreadcrumb(breadcrumbContainer, goToNode);

const worldTree = mountWorldTree(mustGetElement('world-tree-container'), {
  getNodes: () => [...grid.nodes.values()],
  getCurrentId: () => navigator.getCurrentNode().id,
  onSelect: goToNode,
  onAddChild: (id) => nodeActions.addChildNode(id),
  onEdit: (id) => nodeActions.editNode(id),
  onDelete: (id) => nodeActions.deleteNode(id),
});

// The Play-mode counterpart to the Build-mode world tree: the same hierarchy,
// but read-only (no add/delete affordances) and limited to nodes the party has
// actually discovered, so unexplored regions stay hidden from the table.
// Selecting a node offers to teleport the party there.
const regionTree = mountWorldTree(mustGetElement('region-tree-container'), {
  getNodes: () => discoveredNodes([...grid.nodes.values()], partyTracker.getPosition()),
  getCurrentId: () => navigator.getCurrentNode().id,
  onSelect: teleportToNode,
});

/**
 * Offer to teleport the party to a discovered node. Clicking the node the
 * party already occupies just brings the view back to it; otherwise a confirm
 * dialog gates the move. The party lands on the node's first revealed tile
 * (there is always one for a discovered node with tiles), falling back to the
 * grid centre for a tile-less node.
 * @param {string} nodeId
 */
async function teleportToNode(nodeId) {
  const node = grid.getNode(nodeId);
  if (!node) return;
  if (partyTracker.getPosition().nodeId === nodeId) {
    goToNode(nodeId);
    return;
  }
  const ok = await confirmModal(`Would you like to teleport to "${node.name}"?`, {
    confirmLabel: 'Teleport',
  });
  if (!ok) return;
  // Resolve the landing spot against the node's real tiles, so a teleport into
  // a sparse or walled node (e.g. a generated dungeon) never strands the party
  // on a wall or an empty cell.
  const target = resolveEntryTile(
    node,
    node.tiles.find((t) => t.revealed)?.id ??
      `${Math.floor(node.width / 2)},${Math.floor(node.height / 2)}`,
  );
  partyTracker.moveTo(nodeId, target);
  goToNode(nodeId);
  logEvent('travel', `Traveled to ${node.name}.`);
  encounterPanel.update();
  initiativePanel.update();
  npcPanel.update();
  handoutPanel.update();
  maybeTriggerEncounter();
}

/**
 * Resolve a completed region-tool drag: link every existing tile in the
 * marquee block to a child node chosen from the current node's children, or to
 * a newly created one — the area counterpart to the inspector's per-tile link.
 */
async function finishRegionStroke() {
  const rect = mapCanvas.marquee;
  regionAnchor = null;
  mapCanvas.setMarquee(null);
  if (!rect) return;
  const node = navigator.getCurrentNode();
  if (!tilesInRect(node, rect).length) {
    await confirmModal('No tiles in the selected block. Paint tiles first, then link them.', {
      confirmLabel: 'OK',
    });
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
    childId = values.target || (await nodeActions.addChildNode(node.id));
  } else {
    childId = await nodeActions.addChildNode(node.id);
  }
  if (!childId) return;
  snapshotEdit(navigator.getCurrentNode());
  const updated = linkTilesInRect(navigator.getCurrentNode(), rect, childId);
  grid.updateNode(updated);
  mapCanvas.refreshNode(updated);
  if (selectedTileId) inspector.setTile(getTile(updated, selectedTileId) ?? null, true);
  markDirty();
}

/** @type {{ update: () => void } | null} assigned right after mapCanvas exists */
let mapControls = null;

const mapCanvas = new MapCanvas(canvasEl, palette, {
  tileSize: 48,
  getNodeName: (nodeId) => grid.getNode(nodeId)?.name,
  onViewChange: () => mapControls?.update(),
  // Play-mode read side of the Build-mode tile inspector: hovering a revealed
  // tile with metadata shows what the GM authored there. Build mode already
  // surfaces the same data through the inspector, so hover stays quiet there.
  onCellHover: (tile, clientX, clientY) => {
    if (
      currentMode !== 'play' ||
      !tile ||
      !tile.revealed ||
      (tile.metadata.discoverable && !tile.metadata.discovered) ||
      (!tile.metadata.poiType && !tile.metadata.notes)
    ) {
      tileTooltip.hide();
      return;
    }
    const poiType = tile.metadata.poiType;
    // Notes are the GM's secret; players see only the POI type. A player-role
    // tile with no POI type therefore has nothing to show.
    const gm = isGM(currentRole);
    if (!gm && !poiType) {
      tileTooltip.hide();
      return;
    }
    tileTooltip.show(
      {
        title: poiType ? poiType.charAt(0).toUpperCase() + poiType.slice(1) : '',
        notes: gm ? tile.metadata.notes : '',
      },
      clientX,
      clientY,
    );
  },
  // Build-mode authoring arrives as strokes: a left-drag applies the active
  // brush to every cell it crosses (a click is a one-cell stroke), so painting
  // a row is one gesture instead of one click per tile. The Region brush
  // instead drags out a marquee block, resolved to a child-node link on release.
  onStrokeCell: (x, y, tile, first) => {
    const id = `${x},${y}`;
    // Play-mode GM fog brush: strokes reveal/hide fog instead of authoring
    // tiles. Only active while a fog tool is toggled on (which is what put the
    // canvas in authoring mode outside Build).
    if (currentMode === 'play') {
      if (fogTool) {
        applyToTile(id, (node) => setTileRevealed(node, id, fogTool === 'reveal'));
      }
      return;
    }
    // A whole drag coalesces into one stroke, so one snapshot on its first
    // cell makes the stroke the unit of undo. Inspect (no brush) and the
    // region marquee don't mutate here; the region tool snapshots on link.
    if (first && activeBrush && activeBrush !== 'region') {
      snapshotEdit(navigator.getCurrentNode());
    }
    if (activeBrush === 'region') {
      if (first) regionAnchor = { x, y };
      if (regionAnchor) mapCanvas.setMarquee(normalizeRect(regionAnchor, { x, y }));
    } else if (activeBrush === 'erase') {
      applyToTile(id, (node) => eraseTile(node, id));
    } else if (activeBrush === 'erase-path') {
      applyToTile(id, (node) => erasePath(node, id));
    } else if (activeBrush) {
      // Captured so the closure below keeps the non-null narrowing.
      const brush = activeBrush;
      const overlay = brush.type === 'road';
      applyToTile(id, (node) => paintTile(node, id, brush.imageRef, overlay));
    } else if (first) {
      // Inspect acts on the pressed cell only; dragging doesn't re-select.
      selectTile(id);
    }
  },
  onStrokeEnd: () => {
    if (regionAnchor) finishRegionStroke();
  },
  onCellClick: (x, y, tile) => {
    // Fires only outside authoring mode: Play-mode navigation and party moves.
    // Empty cells are inert.
    if (!tile) return;
    if (tile.childNodeId) {
      const parent = navigator.getCurrentNode();
      if (navigator.zoomIn(tile.id)) {
        const child = navigator.getCurrentNode();
        // Zooming into a region moves the party into it. Unless the party has
        // already been placed in this child before, drop them at the edge they
        // approached from and reveal fog around it, so the child doesn't render
        // as a blank fog field with no party marker.
        if (partyTracker.getPosition().nodeId !== child.id) {
          partyTracker.moveTo(
            child.id,
            computeRegionEntryTile(parent, child, tile.childNodeId, partyTracker.getPosition()),
          );
        }
        // Re-read the node: moveTo wrote a new, fog-revealed node into the grid,
        // so the `child` captured above is stale and still fully fogged.
        mapCanvas.setNode(navigator.getCurrentNode());
        breadcrumb.update(navigator.getBreadcrumb());
        worldTree.update();
        // Entering a node for the first time discovers it.
        regionTree.update();
        logEvent('travel', `Entered ${child.name}.`);
      }
    } else {
      partyTracker.moveTo(navigator.getCurrentNode().id, tile.id);
      discoverTile(tile);
      mapCanvas.refreshNode(navigator.getCurrentNode());
    }
    syncPartyMarker();
    markDirty(); // party position and fog changed
    // The party may have changed nodes, so the location-scoped encounter list
    // needs re-filtering. (Mounted later in this file; clicks only happen after.)
    encounterPanel.update();
    initiativePanel.update();
    npcPanel.update();
    handoutPanel.update();
    maybeTriggerEncounter();
  },
});

// The node create/edit/delete actions live in their own module; they resync
// the views above, which now all exist, so their context can be handed over.
// Views/callbacks are read at call time, so a stale reference can't form.
nodeActions = createNodeActions({
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
  markDirty,
});

const inspector = mountTileInspector(mustGetElement('inspector-container'), {
  onChange: (patch) => {
    if (!selectedTileId) return;
    const updated = updateTileMetadata(navigator.getCurrentNode(), selectedTileId, patch);
    grid.updateNode(updated);
    mapCanvas.refreshNode(updated);
    inspector.setTile(getTile(updated, selectedTileId) ?? null, true);
    markDirty();
  },
  linking: {
    getOptions: () => grid.getChildren(navigator.currentNodeId).map((n) => ({ id: n.id, name: n.name })),
    onChange: (childNodeId) => linkSelectedTile(childNodeId),
    onCreateNew: async () => {
      const id = await nodeActions.addChildNode(navigator.currentNodeId);
      if (id) linkSelectedTile(id);
    },
  },
  // Build-mode spawn placement: make the selected tile the party's start.
  onSetSpawn: (tileId) => {
    partyTracker.moveTo(navigator.getCurrentNode().id, tileId);
    mapCanvas.refreshNode(navigator.getCurrentNode());
    syncPartyMarker();
    markDirty();
  },
});

/**
 * Point the selected tile's childNodeId at a node (or null to unlink), so
 * zooming that tile enters the linked node. Re-derives region groups via the
 * canvas refresh so the block outline updates immediately.
 * @param {string | null} childNodeId
 */
function linkSelectedTile(childNodeId) {
  if (!selectedTileId) return;
  const node = navigator.getCurrentNode();
  snapshotEdit(node);
  const tiles = node.tiles.map((t) => (t.id === selectedTileId ? { ...t, childNodeId } : t));
  const updated = { ...node, tiles };
  grid.updateNode(updated);
  mapCanvas.refreshNode(updated);
  inspector.setTile(getTile(updated, selectedTileId) ?? null, true);
  markDirty();
}

/**
 * Select a tile within the current node and point the inspector at it.
 * @param {string} tileId
 */
function selectTile(tileId) {
  selectedTileId = tileId;
  mapCanvas.setSelectedTile(tileId);
  inspector.setTile(getTile(navigator.getCurrentNode(), tileId) ?? null, true);
}

/**
 * Apply a pure node transform (paint/erase) to the current node, persist it,
 * re-render the canvas, and keep the inspector in sync if it was showing the
 * affected tile.
 * @param {string} tileId
 * @param {(node: import('./types/map.js').MapNode) => import('./types/map.js').MapNode} transform
 */
function applyToTile(tileId, transform) {
  const updated = transform(navigator.getCurrentNode());
  grid.updateNode(updated);
  mapCanvas.refreshNode(updated);
  if (tileId === selectedTileId) {
    inspector.setTile(getTile(updated, tileId) ?? null, true);
  }
  refreshMapDescription();
  markDirty();
}

/**
 * Mark a discoverable POI discovered once the party reaches it, persisting the
 * flag and logging the find. A non-discoverable or already-found tile is a
 * no-op. Read the node fresh from the navigator since the party's move just
 * rewrote it in the grid.
 * @param {import('./types/map.js').Tile} tile
 */
function discoverTile(tile) {
  if (!tile.metadata.discoverable || tile.metadata.discovered) return;
  const node = navigator.getCurrentNode();
  grid.updateNode(updateTileMetadata(node, tile.id, { discovered: true }));
  const what = tile.metadata.poiType ?? 'a hidden location';
  logEvent('travel', `Discovered ${what}${tile.metadata.notes ? `: ${tile.metadata.notes}` : ''}.`);
}

const tileTooltip = mountTileTooltip(document.body);

// The tooltip doubles as the palette's hover label, naming each image-only swatch.
const palettePanel = mountPalettePanel(
  mustGetElement('palette-container'),
  palette,
  (brush) => {
    activeBrush = brush;
  },
  tileTooltip,
);

// The canvas is a drop target for palette swatches: dragging a tile onto a grid
// cell paints it there, an alternative to selecting a brush and clicking.
canvasEl.addEventListener('dragover', (event) => {
  if (currentMode === 'build') event.preventDefault();
});
canvasEl.addEventListener('drop', (event) => {
  if (currentMode !== 'build') return;
  event.preventDefault();
  const id = event.dataTransfer?.getData('text/tile-id');
  const entry = id ? palette.get(id) : undefined;
  if (!entry) return;
  const rect = canvasEl.getBoundingClientRect();
  const buffer = clientToBuffer(event.clientX, event.clientY, rect, canvasEl.width, canvasEl.height);
  const coords = screenToTile(buffer.x, buffer.y, mapCanvas.tileSize, mapCanvas.offsetX, mapCanvas.offsetY, mapCanvas.scale);
  const tileId = `${coords.x},${coords.y}`;
  snapshotEdit(navigator.getCurrentNode());
  applyToTile(tileId, (node) => paintTile(node, tileId, entry.imageRef, entry.type === 'road'));
});

mapControls = mountMapControls(mustGetElement('map-viewport'), {
  onZoomIn: () => mapCanvas.zoomBy(1.25),
  onZoomOut: () => mapCanvas.zoomBy(1 / 1.25),
  onFit: () => mapCanvas.fit(),
  getZoom: () => mapCanvas.scale,
  // GM fog controls (hidden from the player role via CSS): brushes stroke fog
  // on/off, reveal-all lights the whole current node.
  fog: {
    getTool: () => fogTool,
    onToolChange: (tool) => {
      fogTool = currentMode === 'play' ? tool : null;
      // A fog brush needs the stroke gesture, which only fires in authoring
      // mode; Build mode keeps authoring on regardless.
      mapCanvas.setAuthoring(currentMode === 'build' || fogTool !== null);
    },
    onRevealAll: () => {
      const node = revealAll(navigator.getCurrentNode());
      grid.updateNode(node);
      mapCanvas.refreshNode(node);
      regionTree.update();
      refreshMapDescription();
      markDirty();
      toasts.show(`Revealed all of "${node.name}".`);
    },
  },
});

const mapDescription = mountMapDescription(mustGetElement('map-viewport'));

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

mapCanvas.setNode(navigator.getCurrentNode());
syncPartyMarker();
syncPaletteKind();
breadcrumb.update(navigator.getBreadcrumb());

/** @type {string | null} id of the character the sheet/inventory are scoped to */
let selectedCharacterId = characters[0]?.id ?? null;

/** @returns {Character | null} */
function selectedCharacter() {
  return characters.find((c) => c.id === selectedCharacterId) ?? null;
}

/**
 * Point the sheet and inventory at a character (or null) and refresh the roster.
 * @param {string | null} id
 */
function selectCharacter(id) {
  selectedCharacterId = id;
  const character = selectedCharacter();
  characterSheet.setCharacter(character);
  inventoryPanel.setCharacter(character);
  characterRoster.update();
}

/**
 * Write an edited character back into the roster by id.
 * @param {Character} next
 */
function commitCharacter(next) {
  characters = replaceById(characters, next);
  characterRoster.update();
  markDirty();
}

const characterRoster = mountCharacterRoster(mustGetElement('party-container'), {
  getCharacters: () => characters,
  getSelectedId: () => selectedCharacterId,
  onSelect: selectCharacter,
  onAdd: async () => {
    const values = await promptModal('New character', [
      { name: 'name', label: 'Name', value: '' },
      { name: 'race', label: 'Race', value: '' },
      { name: 'maxHP', label: 'Max HP', type: 'number', value: 10, min: 1 },
      { name: 'maxMana', label: 'Max mana', type: 'number', value: 0, min: 0 },
    ]);
    const name = values?.name.trim();
    if (!values || !name) return;
    const maxHP = Math.max(1, Number(values.maxHP) || 1);
    const maxMana = Math.max(0, Number(values.maxMana) || 0);
    let created = withHP(
      createCharacter(slugId(name, characters.map((c) => c.id)), name, {}, values.race.trim()),
      maxHP,
    );
    if (maxMana > 0) created = withMana(created, maxMana);
    characters = [...characters, created];
    selectCharacter(characters[characters.length - 1].id);
    markDirty();
  },
  onDelete: async (id) => {
    const character = characters.find((c) => c.id === id);
    if (!character) return;
    const ok = await confirmModal(`Delete "${character.name}"? Their inventory is lost too.`, {
      danger: true,
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    characters = removeById(characters, id);
    selectCharacter(id === selectedCharacterId ? (characters[0]?.id ?? null) : selectedCharacterId);
    markDirty();
  },
  // Grant the same XP to the whole party at once — the common post-encounter
  // case — instead of opening each sheet in turn. Levels (and the HP/mana
  // growth addXP applies) land per character as usual.
  onAwardXP: async () => {
    const values = await promptModal(
      'Award XP to the party',
      [{ name: 'amount', label: 'XP per character', type: 'number', value: 100, min: 1 }],
      { submitLabel: 'Award' },
    );
    const amount = Math.floor(Number(values?.amount) || 0);
    if (!values || amount <= 0) return;
    characters = characters.map((c) => addXP(c, amount));
    selectCharacter(selectedCharacterId); // refresh sheet/inventory/roster
    markDirty();
    logEvent('note', `The party is awarded ${amount} XP each.`);
    toasts.show(`Awarded ${amount} XP to ${characters.length} character${characters.length === 1 ? '' : 's'}.`);
  },
});

const characterSheet = mountCharacterSheet(
  mustGetElement('character-sheet-container'),
  selectedCharacter(),
  (next) => {
    commitCharacter(next);
    inventoryPanel.setCharacter(next);
  },
);

const inventoryPanel = mountInventoryPanel(
  mustGetElement('inventory-container'),
  selectedCharacter(),
  (next) => {
    commitCharacter(next);
    characterSheet.setCharacter(next);
  },
);

const encounterPanel = mountEncounterPanel(mustGetElement('encounter-container'), {
  // The panel shows only what's relevant where the party stands: encounters
  // staged in the current node, plus unbound ones from older saves.
  getEncounters: () => encountersAt(encounters, partyTracker.getPosition()),
  onUpdate: (next) => {
    // Log the transition into defeat exactly once (damage that keeps it down
    // shouldn't re-log), by comparing against the pre-update encounter.
    const prev = encounters.find((e) => e.id === next.id);
    if (prev && !isDefeated(prev) && isDefeated(next)) logEvent('combat', `Defeated ${next.name}.`);
    encounters = replaceById(encounters, next);
    syncEncounterMarkers(); // a defeat or move should update the map marker
    markDirty();
  },
  onDelete: (id) => {
    encounters = removeById(encounters, id);
    syncEncounterMarkers();
    markDirty();
  },
  onAdd: async () => {
    const values = await promptModal('New encounter', [
      { name: 'name', label: 'Name', value: '' },
      { name: 'maxHP', label: 'Max HP', type: 'number', value: 10, min: 1 },
    ]);
    if (!values) return null;
    const name = values.name.trim();
    if (!name) return null;
    const maxHP = Math.max(1, Number(values.maxHP) || 1);
    // New encounters are staged where the party currently is, so the GM
    // authors them in place and they scope to that node from then on.
    const created = createEncounter(
      slugId(name, encounters.map((e) => e.id)),
      name,
      maxHP,
      {},
      { ...partyTracker.getPosition() },
    );
    encounters = [...encounters, created];
    syncEncounterMarkers();
    markDirty();
    return created;
  },
  // Save an encounter's blueprint (name, max HP, stat block) to the bestiary,
  // so the next Goblin isn't typed from scratch. Same-named saves stack as
  // separate templates — a template is a snapshot, not a live link.
  onSaveTemplate: (encounter) => {
    bestiary = [...bestiary, toTemplate(slugId(encounter.name, bestiary.map((t) => t.id)), encounter)];
    markDirty();
    toasts.show(`Saved "${encounter.name}" to the bestiary.`);
  },
  // Spawn a fresh, full-health encounter from a saved template at the party's
  // location; the same dialog can also prune a stale template instead.
  onAddFromTemplate: async () => {
    if (bestiary.length === 0) {
      await alertModal('The bestiary is empty. Save an encounter as a template first (the save icon on its row).', {
        title: 'Bestiary',
      });
      return null;
    }
    const values = await promptModal(
      'Add from bestiary',
      [
        {
          name: 'template',
          label: 'Template',
          type: 'select',
          options: bestiary.map((t) => ({ value: t.id, label: `${t.name} (${t.maxHP} HP)` })),
        },
        {
          name: 'action',
          label: 'Action',
          type: 'select',
          value: 'spawn',
          options: [
            { value: 'spawn', label: 'Spawn at party location' },
            { value: 'delete', label: 'Delete this template' },
          ],
        },
      ],
      { submitLabel: 'Apply' },
    );
    const template = values ? bestiary.find((t) => t.id === values.template) : undefined;
    if (!values || !template) return null;
    if (values.action === 'delete') {
      bestiary = removeById(bestiary, template.id);
      markDirty();
      toasts.show(`Deleted "${template.name}" from the bestiary.`);
      return null;
    }
    const created = fromTemplate(template, slugId(template.name, encounters.map((e) => e.id)), {
      ...partyTracker.getPosition(),
    });
    encounters = [...encounters, created];
    syncEncounterMarkers();
    markDirty();
    return created;
  },
  confirmDelete: (encounter) =>
    confirmModal(`Delete "${encounter.name}"?`, { danger: true, confirmLabel: 'Delete' }),
  getRole: () => currentRole,
});

const timePanel = mountTimePanel(mustGetElement('time-container'), {
  getClock: () => clock,
  onAdvance: () => {
    clock = advanceWatches(clock, 1);
    markDirty();
  },
  onShortRest: () => {
    characters = characters.map(shortRest);
    clock = advanceWatches(clock, 1);
    selectCharacter(selectedCharacterId);
    logEvent('rest', `The party takes a short rest. Now ${formatClock(clock)}.`);
  },
  onLongRest: () => {
    characters = characters.map(longRest);
    clock = advanceToDawn(clock);
    selectCharacter(selectedCharacterId);
    logEvent('rest', `The party takes a long rest. Now ${formatClock(clock)}.`);
  },
});

const initiativePanel = mountInitiativePanel(mustGetElement('initiative-container'), {
  getState: () => combat,
  // Candidate combatants: the whole party plus the living encounters where the
  // party stands. Initiative defaults to 10 and is edited in the setup list.
  getRoster: () => [
    ...characters.map((c) => createParticipant(c.id, c.name, 'party', 10)),
    ...encountersAt(encounters, partyTracker.getPosition())
      .filter((e) => !isDefeated(e))
      .map((e) => createParticipant(e.id, e.name, 'foe', 10)),
  ],
  onStart: (participants) => {
    combat = startCombat(participants);
  },
  onNext: () => {
    if (!combat) return;
    const result = advanceTurn(combat);
    combat = result.state;
    // A new round elapsed, so tick every combatant's timed conditions down.
    if (result.wrapped) {
      characters = characters.map((c) => ({ ...c, conditions: tickConditions(c.conditions) }));
      encounters = encounters.map((e) => ({ ...e, conditions: tickConditions(e.conditions) }));
      selectCharacter(selectedCharacterId);
      encounterPanel.update();
    }
  },
  onEnd: () => {
    combat = null;
  },
  // Straight d20 per combatant; the field stays editable for manual override.
  rollInitiative: () => Math.floor(Math.random() * 20) + 1,
});

const dispositionOptions = DISPOSITIONS.map((d) => ({ value: d, label: d[0].toUpperCase() + d.slice(1) }));

const npcPanel = mountNPCPanel(mustGetElement('npc-container'), {
  getNPCs: () => npcsAt(npcs, partyTracker.getPosition()),
  onDelete: (id) => {
    npcs = removeById(npcs, id);
    markDirty();
  },
  onAdd: async () => {
    const values = await promptModal('New NPC', [
      { name: 'name', label: 'Name', value: '' },
      { name: 'role', label: 'Role / faction', value: '' },
      { name: 'disposition', label: 'Disposition', type: 'select', value: 'neutral', options: dispositionOptions },
      { name: 'notes', label: 'Notes', value: '' },
    ]);
    const name = values?.name.trim();
    if (!values || !name) return null;
    // Placed where the party stands, so the NPC scopes to that node.
    const created = createNPC(slugId(name, npcs.map((n) => n.id)), name, {
      role: values.role.trim(),
      disposition: /** @type {import('./types/npc.js').Disposition} */ (values.disposition),
      notes: values.notes.trim(),
      location: { ...partyTracker.getPosition() },
    });
    npcs = [...npcs, created];
    markDirty();
    return created;
  },
  onEdit: async (npc) => {
    const values = await promptModal(
      'Edit NPC',
      [
        { name: 'name', label: 'Name', value: npc.name },
        { name: 'role', label: 'Role / faction', value: npc.role },
        { name: 'disposition', label: 'Disposition', type: 'select', value: npc.disposition, options: dispositionOptions },
        { name: 'notes', label: 'Notes', value: npc.notes },
      ],
      { submitLabel: 'Save' },
    );
    const name = values?.name.trim();
    if (!values || !name) return false;
    npcs = replaceById(npcs, {
      ...npc,
      name,
      role: values.role.trim(),
      disposition: /** @type {import('./types/npc.js').Disposition} */ (values.disposition),
      notes: values.notes.trim(),
    });
    markDirty();
    return true;
  },
  confirmDelete: (npc) => confirmModal(`Delete "${npc.name}"?`, { danger: true, confirmLabel: 'Delete' }),
});

mountDiceTray(mustGetElement('dice-tray-container'));

const travelogPanel = mountTravelogPanel(mustGetElement('travelog-container'), {
  getEntries: () => travelog,
  onClear: async () => {
    if (travelog.length === 0) return false;
    const ok = await confirmModal('Clear the travelogue? Its recorded events are lost.', {
      danger: true,
      confirmLabel: 'Clear',
    });
    if (ok) {
      travelog = [];
      markDirty();
    }
    return ok;
  },
});

mountQuestPanel(mustGetElement('quest-container'), {
  getQuests: () => quests,
  onToggle: (quest) => {
    quests = replaceById(quests, toggleQuestStatus(quest));
    markDirty();
  },
  onAdd: async () => {
    const values = await promptModal('New quest', [
      { name: 'title', label: 'Title', value: '' },
      { name: 'notes', label: 'Notes', value: '' },
    ]);
    const title = values?.title.trim();
    if (!values || !title) return null;
    const created = createQuest(slugId(title, quests.map((q) => q.id)), title, values.notes.trim());
    quests = [...quests, created];
    markDirty();
    return created;
  },
  onEdit: async (quest) => {
    const values = await promptModal('Edit quest', [
      { name: 'title', label: 'Title', value: quest.title },
      { name: 'notes', label: 'Notes', value: quest.notes },
    ]);
    const title = values?.title.trim();
    if (!values || !title) return false;
    quests = replaceById(quests, { ...quest, title, notes: values.notes.trim() });
    markDirty();
    return true;
  },
  onDelete: async (id) => {
    const quest = quests.find((q) => q.id === id);
    if (!quest) return false;
    const ok = await confirmModal(`Delete "${quest.title}"?`, { danger: true, confirmLabel: 'Delete' });
    if (ok) {
      quests = removeById(quests, id);
      markDirty();
    }
    return ok;
  },
});

const handoutPanel = mountHandoutPanel(mustGetElement('handout-container'), {
  getHandouts: () => handoutsAt(handouts, partyTracker.getPosition().nodeId),
  onToggle: (handout) => {
    handouts = replaceById(handouts, toggleRevealed(handout));
    markDirty();
  },
  onAdd: async () => {
    const values = await promptModal('New handout', [
      { name: 'title', label: 'Title', value: '' },
      { name: 'body', label: 'Read-aloud / lore', value: '' },
      { name: 'image', label: 'Image (optional)', type: 'file' },
    ]);
    const title = values?.title.trim();
    if (!values || !title) return null;
    // Bound to the node the party stands in, so it surfaces at that location.
    const created = createHandout(
      slugId(title, handouts.map((h) => h.id)),
      title,
      values.body.trim(),
      partyTracker.getPosition().nodeId,
      false,
      values.image || null,
    );
    handouts = [...handouts, created];
    markDirty();
    return created;
  },
  onEdit: async (handout) => {
    const values = await promptModal(
      'Edit handout',
      [
        { name: 'title', label: 'Title', value: handout.title },
        { name: 'body', label: 'Read-aloud / lore', value: handout.body },
        { name: 'image', label: 'Image (leave empty to keep)', type: 'file', value: handout.image ?? '' },
      ],
      { submitLabel: 'Save' },
    );
    const title = values?.title.trim();
    if (!values || !title) return false;
    handouts = replaceById(handouts, {
      ...handout,
      title,
      body: values.body.trim(),
      image: values.image || null,
    });
    markDirty();
    return true;
  },
  onDelete: async (id) => {
    const handout = handouts.find((h) => h.id === id);
    if (!handout) return false;
    const ok = await confirmModal(`Delete "${handout.title}"?`, { danger: true, confirmLabel: 'Delete' });
    if (ok) {
      handouts = removeById(handouts, id);
      markDirty();
    }
    return ok;
  },
  getRole: () => currentRole,
});

// Play/Build mode drives which rails the layout shows (a body class toggled by
// CSS), and defaults to Play so a first-run visitor lands on the live view.
const modeSwitch = mountModeSwitch(mustGetElement('mode-switch-container'), currentMode, (mode) => {
  currentMode = mode;
  document.body.classList.toggle('mode-play', mode === 'play');
  document.body.classList.toggle('mode-build', mode === 'build');
  mapCanvas.setRevealAll(mode === 'build');
  mapCanvas.setAuthoring(mode === 'build');
  tileTooltip.hide();
  regionAnchor = null;
  fogTool = null; // the fog brush is a Play-mode tool; changing modes drops it
  mapControls?.update();
  if (mode !== 'build') clearSelection();
  worldTree.update();
  regionTree.update();
  refreshMapDescription();
});

// Viewer role (GM vs player) is orthogonal to Play/Build: it changes what the
// panels reveal, not what the operator can do. Player role is read-only, so it
// forces Play mode and a body class hides the authoring/header affordances via
// CSS; the panels re-render against the new role.
function applyRole() {
  document.body.classList.toggle('role-player', currentRole === 'player');
  document.body.classList.toggle('role-gm', currentRole === 'gm');
  if (currentRole === 'player') {
    modeSwitch.setMode('play');
    // Players don't get the fog brush; drop it and the authoring gesture.
    fogTool = null;
    mapCanvas.setAuthoring(false);
    mapControls?.update();
  }
  encounterPanel.update();
  handoutPanel.update();
  tileTooltip.hide();
}

mountRoleSwitch(mustGetElement('role-switch-container'), currentRole, (role) => {
  currentRole = role;
  sessionStorage.setItem('campaign-builder:role', role);
  applyRole();
});

// Group the Play sidebar panels into Session / Quests / Log tabs so the quest
// log and travelogue get their own space instead of a single long scroll.
wireTabs(mustGetElement('sidebar-tabs'));

// Build-mode procedural generation: fill the current node with an archetype
// layout (wilderness/town for regions, dungeon/castle for interiors) at a size
// preset, as an alternative to painting a large map tile by tile. Archetypes
// are filtered to the node's kind, and overwriting a non-empty node confirms.
mustGetElement('generate-btn').addEventListener('click', async () => {
  const node = navigator.getCurrentNode();
  const archetypes = ARCHETYPES[node.kind];

  /**
   * Build (and memoize) the full generation result for a dialog choice. The
   * RNG is seeded from the choice, so the preview the dialog renders and the
   * layout stamped on accept are the same map — and the seed shown to the GM
   * reproduces it later. Multi-level dungeons are built whole here so the
   * preview's level 1 carries the exact stairs the accepted map will.
   * @type {{ key: string, gen: { width: number, height: number, tiles: import('./types/map.js').Tile[], entry: string }, levels: ReturnType<typeof generateDungeonLevels> | null } | null}
   */
  let candidate = null;
  const freshId = () => {
    let id;
    do id = `node-${Math.random().toString(36).slice(2, 8)}`;
    while (grid.getNode(id));
    return id;
  };
  /** @param {import('./ui/GenerateDialog.js').GenerateChoice} choice */
  const makeCandidate = (choice) => {
    const key = JSON.stringify(choice);
    if (candidate?.key !== key) {
      const rng = mulberry32(choice.seed);
      if (choice.archetype === 'dungeon') {
        // A dungeon can be a chain of levels: each level's stairs-down is
        // linked to a freshly created child node holding the level below, so
        // stairs always connect to a real generated level.
        const levels = generateDungeonLevels(
          palette,
          { size: choice.size, levels: choice.levels },
          rng,
          freshId,
        );
        candidate = { key, gen: levels[0], levels };
      } else {
        candidate = {
          key,
          gen: generateNodeTiles(palette, { kind: node.kind, archetype: choice.archetype, size: choice.size }, rng),
          levels: null,
        };
      }
    }
    return candidate.gen;
  };

  const values = await generateDialog({ archetypes, makeCandidate });
  if (!values) return;
  if (
    node.tiles.length > 0 &&
    !(await confirmModal(`Replace every tile in "${node.name}" with a generated map?`, {
      danger: true,
      confirmLabel: 'Replace',
    }))
  ) {
    return;
  }
  const gen = makeCandidate(values);
  // The regenerated layout replaces the node (and may restamp its parent's
  // entrance link below); snapshot both so the stroke-undo ring can revert it.
  const parentBefore = node.parentId ? grid.getNode(node.parentId) : null;
  snapshotEdit(node, ...(parentBefore ? [parentBefore] : []));
  if (candidate?.levels) {
    candidate.levels.slice(1).forEach((level, i) => {
      const child = createMapNode(
        /** @type {string} */ (level.id),
        `${node.name} (level ${i + 2})`,
        node.id,
        level.width,
        level.height,
        { kind: 'interior', environ: node.environ },
      );
      grid.addNode({ ...child, tiles: level.tiles });
    });
  }
  grid.updateNode({ ...node, width: gen.width, height: gen.height, tiles: gen.tiles });
  // A generated map must be reachable from the overworld, not just internally
  // connected: if no parent tile links to this node yet, stamp one (a POI
  // marker matching the archetype) on the parent tile nearest its centre, so
  // there is always a way in. Tell the GM where it landed so it can be moved.
  const parent = node.parentId ? grid.getNode(node.parentId) : null;
  if (parent) {
    /** @type {Record<string, { marker: string, poi: import('./types/map.js').POIType }>} */
    const entranceArt = {
      dungeon: { marker: 'dungeon', poi: 'dungeon' },
      castle: { marker: 'castle', poi: 'landmark' },
      town: { marker: 'settlement', poi: 'settlement' },
    };
    const artFor = entranceArt[values.archetype];
    const linked = ensureChildLink(parent, node.id, {
      // Wilderness gets no marker: the link rides the existing terrain tile
      // (or a fresh grass tile) and shows as a region outline once discovered.
      markerRef: artFor ? (palette.get(artFor.marker)?.imageRef ?? null) : null,
      createRef: palette.pickVariant('grass', Math.random).imageRef,
      poiType: artFor ? artFor.poi : null,
    });
    if (linked.tileId) {
      grid.updateNode(linked.node);
      alertModal(
        `Linked "${node.name}" from ${parent.name} at tile (${linked.tileId}), so it can be reached during play. Repaint or relink that tile to move the entrance.`,
        { title: 'Entrance placed', label: 'OK' },
      );
    }
  }
  // The regenerated layout may have shrunk past the party or replaced its tile
  // with void/wall; re-land it on the layout's guaranteed entry tile if so.
  const pos = partyTracker.getPosition();
  if (pos.nodeId === node.id) {
    const [px, py] = pos.tileId.split(',').map(Number);
    const landing = resolveEntryTile(navigator.getCurrentNode(), pos.tileId);
    if (px >= gen.width || py >= gen.height || landing !== pos.tileId) {
      partyTracker.moveTo(node.id, px >= gen.width || py >= gen.height ? gen.entry : landing);
    }
  }
  mapCanvas.setNode(navigator.getCurrentNode());
  clearSelection();
  syncPaletteKind();
  syncPartyMarker();
  worldTree.update();
  regionTree.update();
  refreshMapDescription();
  markDirty();
  toasts.show(`Generated ${values.archetype} map in "${node.name}" (seed ${values.seed}).`);
});

// Build-rail map tools: stroke-level undo and a fog-free PNG export of the
// current node (Build rail, so GM/Build only — a player never sees these).
mustGetElement('stroke-undo-btn').addEventListener('click', undoStroke);
mustGetElement('export-png-btn').addEventListener('click', async () => {
  const node = navigator.getCurrentNode();
  const canvas = await renderNodeToCanvas(node, {
    tileSize: 64,
    regionGroups: findRegionGroups(node),
    getNodeName: (id) => grid.getNode(id)?.name,
  });
  downloadCanvasPNG(canvas, exportFilename(node.name));
  toasts.show(`Exported "${node.name}" as PNG.`);
});

// Collapse the Play sidebar to give the map the full width during a session.
const sidebarToggle = /** @type {HTMLButtonElement} */ (mustGetElement('sidebar-toggle'));
sidebarToggle.addEventListener('click', () => {
  const collapsed = document.body.classList.toggle('sidebar-collapsed');
  sidebarToggle.setAttribute('aria-expanded', String(!collapsed));
  sidebarToggle.textContent = collapsed ? 'Show panels' : 'Hide panels';
});

/**
 * Replace the whole campaign: persist the given one and reload, so every
 * module re-initializes from the same loadFromLocalStorage path a normal page
 * load takes (the same pattern the import flow uses).
 * @param {import('./campaign/Campaigns.js').Campaign} campaign
 */
/**
 * Push the currently-persisted campaign onto the undo history ring, so the
 * next save/replace/import is reversible. No-op on a first run with no save.
 */
function snapshotCurrentSave() {
  const current = loadFromLocalStorage();
  if (current) snapshotHistory(current);
}

/** Assemble the live campaign into a serializable state for save/export. */
function buildCurrentState() {
  return buildState(grid, partyTracker.getPosition(), characters, encounters, travelog, quests, {
    clock,
    npcs,
    handouts,
    bestiary,
  });
}

function replaceCampaign(campaign, toastMessage = 'Campaign replaced.') {
  snapshotCurrentSave();
  saveToLocalStorage(
    buildState(
      campaign.grid,
      campaign.party,
      campaign.characters,
      campaign.encounters,
      campaign.travelog,
      campaign.quests,
      { clock: campaign.clock, npcs: campaign.npcs, handouts: campaign.handouts, bestiary: campaign.bestiary },
    ),
  );
  queueToastAfterReload(toastMessage);
  setDirty(false); // intentional reload; don't trip the beforeunload guard
  location.reload();
}

mustGetElement('new-btn').addEventListener('click', async () => {
  const ok = await confirmModal(
    'Start a new blank campaign? The current campaign is replaced, including anything saved.',
    { danger: true, confirmLabel: 'New campaign' },
  );
  if (ok) replaceCampaign(buildBlankCampaign(), 'Started a new blank campaign.');
});

mustGetElement('example-btn').addEventListener('click', async () => {
  const ok = await confirmModal(
    'Load the example campaign? The current campaign is replaced, including anything saved.',
    { danger: true, confirmLabel: 'Load example' },
  );
  if (ok) replaceCampaign(buildExampleCampaign(palette), 'Loaded the example campaign.');
});

mustGetElement('save-btn').addEventListener('click', () => {
  // Snapshot the previous save first so Undo can step back to it.
  snapshotCurrentSave();
  saveToLocalStorage(buildCurrentState());
  setDirty(false);
  toasts.show('Campaign saved.');
});

// Undo restores the most recent snapshot (the state before the last save,
// New, Load example, or Import) and reloads so every module re-initializes
// from it — the same reload path those actions use.
mustGetElement('undo-btn').addEventListener('click', async () => {
  const restored = undoHistory();
  if (!restored) {
    await confirmModal('Nothing to undo.', { confirmLabel: 'OK' });
    return;
  }
  saveToLocalStorage(restored);
  queueToastAfterReload('Restored the previous save.');
  setDirty(false);
  location.reload();
});

// Cross-tab live sync (the minimum-viable multi-device story): when another
// tab of the same origin writes a new save — e.g. a GM laptop driving a
// second player-facing tab — reload so this tab re-initializes from it through
// the normal load path. The browser never fires this for our own saves, so
// there's no feedback loop. A tab with unsaved local changes is asked first
// instead of having them silently discarded.
onExternalSave(async () => {
  if (!dirty) {
    location.reload();
    return;
  }
  const ok = await confirmModal(
    'Another tab saved this campaign. Reload to match it? Your unsaved changes here are discarded.',
    { danger: true, confirmLabel: 'Reload' },
  );
  if (ok) {
    setDirty(false);
    location.reload();
  }
});

mustGetElement('export-btn').addEventListener('click', () => {
  downloadState(buildCurrentState());
  toasts.show('Campaign exported.');
});

const importInput = /** @type {HTMLInputElement} */ (mustGetElement('import-input'));
mustGetElement('import-btn').addEventListener('click', () => importInput.click());
importInput.addEventListener('change', async () => {
  const file = importInput.files?.[0];
  if (!file) return;
  const state = await readStateFromFile(file);
  // Simplest correct way to apply an imported campaign: persist it, then
  // reload so every module re-initializes from the same loadFromLocalStorage
  // path a normal page load takes, rather than re-wiring every closure above.
  snapshotCurrentSave();
  saveToLocalStorage(state);
  queueToastAfterReload('Campaign imported.');
  setDirty(false);
  location.reload();
});

// Show any confirmation queued by a pre-reload action (Undo, Import, New, ...).
flushQueuedToast(toasts);

// App-wide keyboard shortcuts. Skipped while typing in a field or while a
// dialog is open, so they never eat input; the map keeps its own keys (arrows,
// Enter, +/-) via canvas focus. '?' doubles as discoverability for all of it.
document.addEventListener('keydown', (event) => {
  const target = /** @type {HTMLElement} */ (event.target);
  const typing =
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable;
  if (typing || document.querySelector('dialog[open]')) return;

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault();
    mustGetElement('save-btn').click();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    // In Build mode, Ctrl+Z undoes the last stroke-level edit (the thing a GM
    // mid-painting reaches for); the header Undo button keeps the save-level
    // story, which Ctrl+Z still drives everywhere else.
    if (currentMode === 'build') undoStroke();
    else mustGetElement('undo-btn').click();
    return;
  }
  if (event.ctrlKey || event.metaKey || event.altKey) return;

  const gm = isGM(currentRole);
  if (event.key === 'b' && gm) modeSwitch.setMode('build');
  else if (event.key === 'p' && gm) modeSwitch.setMode('play');
  else if (event.key === '?') {
    alertModal(
      [
        'Ctrl/Cmd+S — save the campaign',
        'Ctrl/Cmd+Z — undo (Build: last edit; Play: previous save)',
        'B / P — switch to Build / Play mode',
        'On the map (click it first):',
        'Arrows — move the cursor · Enter/Space — act',
        '+ / - — zoom',
      ].join('\n'),
      { title: 'Keyboard shortcuts', label: 'Close' },
    );
  }
});

// First-run onboarding: a blank campaign in Play mode is a fogged empty map
// with no hint that Build mode, generation, or the example exist. Overlay the
// three ways forward on the map until the GM picks one (or dismisses), then
// never show it again on this browser.
const ONBOARDED_KEY = 'campaign-builder:onboarded';
(function maybeShowOnboarding() {
  const blank =
    grid.nodes.size === 1 &&
    navigator.getCurrentNode().tiles.length === 0 &&
    characters.length === 0;
  if (!blank || localStorage.getItem(ONBOARDED_KEY)) return;

  const overlay = document.createElement('div');
  overlay.className = 'onboarding';
  const card = document.createElement('div');
  card.className = 'onboarding__card card';
  const heading = document.createElement('h2');
  heading.className = 'card__title';
  heading.textContent = 'Welcome, GM';
  const blurb = document.createElement('p');
  blurb.className = 'onboarding__blurb';
  blurb.textContent = 'Your world is empty. Three ways to start:';
  card.append(heading, blurb);

  const dismiss = () => {
    localStorage.setItem(ONBOARDED_KEY, '1');
    overlay.remove();
  };

  /** @param {string} label @param {string} hint @param {() => void} action */
  const option = (label, hint, action) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn onboarding__option';
    btn.textContent = label;
    btn.title = hint;
    btn.addEventListener('click', () => {
      dismiss();
      action();
    });
    card.appendChild(btn);
  };

  option('Build it by hand', 'Switch to Build mode and paint tiles', () =>
    modeSwitch.setMode('build'),
  );
  option('Generate a world', 'Switch to Build mode and auto-generate a map', () => {
    modeSwitch.setMode('build');
    mustGetElement('generate-btn').click();
  });
  option('Load the example campaign', 'See a small filled-in world first', () =>
    mustGetElement('example-btn').click(),
  );

  const skip = document.createElement('button');
  skip.type = 'button';
  skip.className = 'btn onboarding__skip';
  skip.textContent = 'Dismiss';
  skip.addEventListener('click', dismiss);
  card.appendChild(skip);

  overlay.appendChild(card);
  mustGetElement('map-viewport').appendChild(overlay);
})();
