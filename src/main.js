import {
  createMapNode,
  getTile,
  updateTileMetadata,
  resizeNode,
  tilesOutsideBounds,
} from './map/TileGrid.js';
import { TilePalette } from './map/TilePalette.js';
import { MapCanvas, clientToBuffer, screenToTile, parseCoords } from './map/MapCanvas.js';
import { paintTile, eraseTile, normalizeRect, tilesInRect, linkTilesInRect } from './map/TilePaint.js';
import { computeRegionEntryTile } from './map/EntryPoint.js';
import { NODE_KINDS, ENVIRONS } from './map/NodeKinds.js';
import { MapNavigator } from './map/MapNavigator.js';
import { discoveredNodes } from './map/FogOfWar.js';
import {
  buildBlankCampaign,
  buildExampleCampaign,
  loadInitialCampaign,
} from './campaign/Campaigns.js';
import { mustGetElement } from './ui/dom.js';
import { mountBreadcrumb } from './ui/Breadcrumb.js';
import { mountModeSwitch } from './ui/ModeSwitch.js';
import { mountWorldTree } from './ui/WorldTree.js';
import { collectSubtreeIds } from './map/WorldTree.js';
import { mountTileInspector } from './ui/TileInspector.js';
import { mountPalettePanel } from './ui/PalettePanel.js';
import { mountMapControls } from './ui/MapControls.js';
import { mountMapDescription } from './ui/MapDescription.js';
import { mountTileTooltip } from './ui/TileTooltip.js';
import { promptModal, confirmModal } from './ui/Modal.js';
import { PartyTracker } from './party/PartyTracker.js';
import { createCharacter, withHP, withMana } from './entities/Character.js';
import { createEncounter, encountersAt, isDefeated } from './entities/Encounter.js';
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
import {
  buildState,
  saveToLocalStorage,
  downloadState,
  readStateFromFile,
} from './storage/SaveManager.js';

const palette = new TilePalette();

const initial = loadInitialCampaign();

const { grid } = initial;
let { characters, encounters } = initial;
/** @type {import('./types/log.js').LogEntry[]} auto-recorded party travelogue */
let travelog = initial.travelog;
/** @type {import('./types/quest.js').Quest[]} GM-authored quest/session log */
let quests = initial.quests;
/** Monotonic counter making travelogue entry ids unique within a session. */
let logSeq = 0;

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
}

/** @type {'play' | 'build'} */
let currentMode = 'play';
/** @type {string | null} tile id selected for inspection/editing in Build mode */
let selectedTileId = null;
/** @type {import('./ui/PalettePanel.js').Brush} active Build-mode paint brush */
let activeBrush = null;
/** @type {{ x: number, y: number } | null} first cell of an in-progress region-tool drag */
let regionAnchor = null;

/** @typedef {import('./types/entities.js').Character} Character */

const navigator = new MapNavigator(grid, initial.party.nodeId);
const partyTracker = new PartyTracker(grid, initial.party);

const breadcrumbContainer = mustGetElement('breadcrumb-container');
const canvasEl = /** @type {HTMLCanvasElement} */ (mustGetElement('map-canvas'));

/** Show the party marker only on the node the party is actually standing in. */
function syncPartyMarker() {
  const position = partyTracker.getPosition();
  mapCanvas.setPartyTile(position.nodeId === navigator.getCurrentNode().id ? position.tileId : null);
  refreshMapDescription();
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

/**
 * Modal fields (kind + environment) shared by the new-node and edit-node
 * prompts. Environ is a single flat list of every suggested tag across kinds
 * (the modal is static and can't repopulate when the kind select changes), so
 * a GM can pick, say, an interior "temple" tag even while the select still says
 * whatever it defaulted to; the model stores whatever string is chosen.
 * @param {import('./types/map.js').NodeKind} kind
 * @param {string | null} environ
 * @returns {import('./ui/Modal.js').ModalField[]}
 */
function nodeKindFields(kind, environ) {
  const environs = [...ENVIRONS.region, ...ENVIRONS.interior];
  return [
    {
      name: 'kind',
      label: 'Kind',
      type: 'select',
      value: kind,
      options: NODE_KINDS.map((k) => ({ value: k, label: k[0].toUpperCase() + k.slice(1) })),
    },
    {
      name: 'environ',
      label: 'Environment',
      type: 'select',
      value: environ ?? '',
      options: [
        { value: '', label: '(none)' },
        ...environs.map((e) => ({ value: e, label: e[0].toUpperCase() + e.slice(1) })),
      ],
    },
  ];
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
  onAddChild: addChildNode,
  onEdit: editNode,
  onDelete: deleteNode,
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
  const target =
    node.tiles.find((t) => t.revealed)?.id ??
    `${Math.floor(node.width / 2)},${Math.floor(node.height / 2)}`;
  partyTracker.moveTo(nodeId, target);
  goToNode(nodeId);
  logEvent('travel', `Traveled to ${node.name}.`);
  encounterPanel.update();
}

/** Generate a node id not already used by the grid. */
function freshNodeId() {
  let id;
  do {
    id = `node-${Math.random().toString(36).slice(2, 8)}`;
  } while (grid.getNode(id));
  return id;
}

/**
 * Prompt for a new child MapNode's name and dimensions, add it under parentId,
 * and refresh the tree. Returns the new node id, or null if cancelled.
 * @param {string} parentId
 * @returns {Promise<string | null>}
 */
async function addChildNode(parentId) {
  const values = await promptModal('New node', [
    { name: 'name', label: 'Name', value: 'New region' },
    { name: 'width', label: 'Width (tiles)', type: 'number', value: 6, min: 1 },
    { name: 'height', label: 'Height (tiles)', type: 'number', value: 6, min: 1 },
    ...nodeKindFields('region', null),
  ]);
  if (!values) return null;
  const id = freshNodeId();
  const width = Math.max(1, Number(values.width) || 1);
  const height = Math.max(1, Number(values.height) || 1);
  const kind = /** @type {import('./types/map.js').NodeKind} */ (
    NODE_KINDS.includes(values.kind) ? values.kind : 'region'
  );
  grid.addNode(
    createMapNode(id, values.name || 'Untitled', parentId, width, height, {
      kind,
      environ: values.environ || null,
    }),
  );
  worldTree.update();
  return id;
}

/**
 * Confirm and delete a node and its subtree, then move the view somewhere valid
 * if the current node was removed. Refuses to delete the last remaining node.
 * @param {string} nodeId
 */
async function deleteNode(nodeId) {
  const node = grid.getNode(nodeId);
  if (!node) return;
  const doomed = collectSubtreeIds([...grid.nodes.values()], nodeId);
  if (doomed.size >= grid.nodes.size) {
    await confirmModal('Cannot delete the last node in the campaign.', { confirmLabel: 'OK' });
    return;
  }
  const ok = await confirmModal(`Delete "${node.name}" and everything inside it?`, {
    danger: true,
    confirmLabel: 'Delete',
  });
  if (!ok) return;

  const removed = grid.removeNode(nodeId);
  if (removed.has(navigator.currentNodeId)) {
    const fallback =
      node.parentId && grid.getNode(node.parentId) ? node.parentId : [...grid.nodes.keys()][0];
    goToNode(fallback);
  } else {
    // Current node survived, but a link it drew may have been cleared.
    mapCanvas.refreshNode(navigator.getCurrentNode());
    worldTree.update();
    regionTree.update();
  }
}

/**
 * Edit a node's name and grid dimensions after creation. Growing keeps every
 * tile; shrinking prompts before pruning tiles outside the new bounds, and
 * pulls the party back inside them if it stood on a pruned tile.
 * @param {string} nodeId
 */
async function editNode(nodeId) {
  const node = grid.getNode(nodeId);
  if (!node) return;
  const values = await promptModal(
    'Edit node',
    [
      { name: 'name', label: 'Name', value: node.name },
      { name: 'width', label: 'Width (tiles)', type: 'number', value: node.width, min: 1 },
      { name: 'height', label: 'Height (tiles)', type: 'number', value: node.height, min: 1 },
      ...nodeKindFields(node.kind, node.environ),
    ],
    { submitLabel: 'Save' },
  );
  if (!values) return;
  const width = Math.max(1, Number(values.width) || node.width);
  const height = Math.max(1, Number(values.height) || node.height);
  const lost = tilesOutsideBounds(node, width, height);
  if (lost.length) {
    const ok = await confirmModal(
      `Shrinking "${node.name}" removes ${lost.length} tile${lost.length === 1 ? '' : 's'} outside the new bounds.`,
      { danger: true, confirmLabel: 'Shrink' },
    );
    if (!ok) return;
  }
  const kind = /** @type {import('./types/map.js').NodeKind} */ (
    NODE_KINDS.includes(values.kind) ? values.kind : node.kind
  );
  grid.updateNode({
    ...resizeNode(node, width, height),
    name: values.name.trim() || node.name,
    kind,
    environ: values.environ || null,
  });

  const position = partyTracker.getPosition();
  if (position.nodeId === nodeId) {
    const coords = parseCoords(position.tileId);
    if (coords && (coords.x >= width || coords.y >= height)) {
      partyTracker.moveTo(
        nodeId,
        `${Math.min(coords.x, width - 1)},${Math.min(coords.y, height - 1)}`,
      );
    }
  }
  if (navigator.getCurrentNode().id === nodeId) {
    // The extent or kind changed, so re-frame the view and re-filter the
    // palette; the selected tile may be gone.
    clearSelection();
    mapCanvas.setNode(navigator.getCurrentNode());
    syncPartyMarker();
    syncPaletteKind();
  }
  breadcrumb.update(navigator.getBreadcrumb());
  worldTree.update();
  regionTree.update();
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
    childId = values.target || (await addChildNode(node.id));
  } else {
    childId = await addChildNode(node.id);
  }
  if (!childId) return;
  const updated = linkTilesInRect(navigator.getCurrentNode(), rect, childId);
  grid.updateNode(updated);
  mapCanvas.refreshNode(updated);
  if (selectedTileId) inspector.setTile(getTile(updated, selectedTileId) ?? null, true);
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
      (!tile.metadata.poiType && !tile.metadata.notes)
    ) {
      tileTooltip.hide();
      return;
    }
    const poiType = tile.metadata.poiType;
    tileTooltip.show(
      {
        title: poiType ? poiType.charAt(0).toUpperCase() + poiType.slice(1) : '',
        notes: tile.metadata.notes,
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
    if (activeBrush === 'region') {
      if (first) regionAnchor = { x, y };
      if (regionAnchor) mapCanvas.setMarquee(normalizeRect(regionAnchor, { x, y }));
    } else if (activeBrush === 'erase') {
      applyToTile(id, (node) => eraseTile(node, id));
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
      mapCanvas.refreshNode(navigator.getCurrentNode());
    }
    syncPartyMarker();
    // The party may have changed nodes, so the location-scoped encounter list
    // needs re-filtering. (Mounted later in this file; clicks only happen after.)
    encounterPanel.update();
  },
});

const inspector = mountTileInspector(mustGetElement('inspector-container'), {
  onChange: (patch) => {
    if (!selectedTileId) return;
    const updated = updateTileMetadata(navigator.getCurrentNode(), selectedTileId, patch);
    grid.updateNode(updated);
    mapCanvas.refreshNode(updated);
    inspector.setTile(getTile(updated, selectedTileId) ?? null, true);
  },
  linking: {
    getOptions: () => grid.getChildren(navigator.currentNodeId).map((n) => ({ id: n.id, name: n.name })),
    onChange: (childNodeId) => linkSelectedTile(childNodeId),
    onCreateNew: async () => {
      const id = await addChildNode(navigator.currentNodeId);
      if (id) linkSelectedTile(id);
    },
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
  const tiles = node.tiles.map((t) => (t.id === selectedTileId ? { ...t, childNodeId } : t));
  const updated = { ...node, tiles };
  grid.updateNode(updated);
  mapCanvas.refreshNode(updated);
  inspector.setTile(getTile(updated, selectedTileId) ?? null, true);
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
  applyToTile(tileId, (node) => paintTile(node, tileId, entry.imageRef, entry.type === 'road'));
});

mapControls = mountMapControls(mustGetElement('map-viewport'), {
  onZoomIn: () => mapCanvas.zoomBy(1.25),
  onZoomOut: () => mapCanvas.zoomBy(1 / 1.25),
  onFit: () => mapCanvas.fit(),
  getZoom: () => mapCanvas.scale,
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
  },
  onDelete: (id) => {
    encounters = removeById(encounters, id);
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
    return created;
  },
  confirmDelete: (encounter) =>
    confirmModal(`Delete "${encounter.name}"?`, { danger: true, confirmLabel: 'Delete' }),
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
    if (ok) travelog = [];
    return ok;
  },
});

mountQuestPanel(mustGetElement('quest-container'), {
  getQuests: () => quests,
  onToggle: (quest) => {
    quests = replaceById(quests, toggleQuestStatus(quest));
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
    return true;
  },
  onDelete: async (id) => {
    const quest = quests.find((q) => q.id === id);
    if (!quest) return false;
    const ok = await confirmModal(`Delete "${quest.title}"?`, { danger: true, confirmLabel: 'Delete' });
    if (ok) quests = removeById(quests, id);
    return ok;
  },
});

// Play/Build mode drives which rails the layout shows (a body class toggled by
// CSS), and defaults to Play so a first-run visitor lands on the live view.
mountModeSwitch(mustGetElement('mode-switch-container'), currentMode, (mode) => {
  currentMode = mode;
  document.body.classList.toggle('mode-play', mode === 'play');
  document.body.classList.toggle('mode-build', mode === 'build');
  mapCanvas.setRevealAll(mode === 'build');
  mapCanvas.setAuthoring(mode === 'build');
  tileTooltip.hide();
  regionAnchor = null;
  if (mode !== 'build') clearSelection();
  worldTree.update();
  regionTree.update();
  refreshMapDescription();
});

/**
 * Replace the whole campaign: persist the given one and reload, so every
 * module re-initializes from the same loadFromLocalStorage path a normal page
 * load takes (the same pattern the import flow uses).
 * @param {import('./campaign/Campaigns.js').Campaign} campaign
 */
function replaceCampaign(campaign) {
  saveToLocalStorage(
    buildState(
      campaign.grid,
      campaign.party,
      campaign.characters,
      campaign.encounters,
      campaign.travelog,
      campaign.quests,
    ),
  );
  location.reload();
}

mustGetElement('new-btn').addEventListener('click', async () => {
  const ok = await confirmModal(
    'Start a new blank campaign? The current campaign is replaced, including anything saved.',
    { danger: true, confirmLabel: 'New campaign' },
  );
  if (ok) replaceCampaign(buildBlankCampaign());
});

mustGetElement('example-btn').addEventListener('click', async () => {
  const ok = await confirmModal(
    'Load the example campaign? The current campaign is replaced, including anything saved.',
    { danger: true, confirmLabel: 'Load example' },
  );
  if (ok) replaceCampaign(buildExampleCampaign(palette));
});

mustGetElement('save-btn').addEventListener('click', () => {
  saveToLocalStorage(
    buildState(grid, partyTracker.getPosition(), characters, encounters, travelog, quests),
  );
});

mustGetElement('export-btn').addEventListener('click', () => {
  downloadState(
    buildState(grid, partyTracker.getPosition(), characters, encounters, travelog, quests),
  );
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
  saveToLocalStorage(state);
  location.reload();
});
