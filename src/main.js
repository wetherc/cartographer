import {
  createMapNode,
  createTile,
  setTile,
  getTile,
  updateTileMetadata,
  TileGrid,
} from './map/TileGrid.js';
import { TilePalette } from './map/TilePalette.js';
import { MapCanvas, clientToBuffer, screenToTile, parseCoords } from './map/MapCanvas.js';
import { paintTile, eraseTile } from './map/TilePaint.js';
import { findRegionGroups } from './map/RegionGroups.js';
import { computeEntryTile } from './map/EntryPoint.js';
import { MapNavigator } from './map/MapNavigator.js';
import { mountBreadcrumb } from './ui/Breadcrumb.js';
import { mountModeSwitch } from './ui/ModeSwitch.js';
import { mountWorldTree } from './ui/WorldTree.js';
import { collectSubtreeIds } from './map/WorldTree.js';
import { mountTileInspector } from './ui/TileInspector.js';
import { mountPalettePanel } from './ui/PalettePanel.js';
import { promptModal, confirmModal } from './ui/Modal.js';
import { PartyTracker } from './party/PartyTracker.js';
import { createCharacter, addResource } from './entities/Character.js';
import { createResource } from './entities/Resource.js';
import { createEncounter } from './entities/Encounter.js';
import { slugId, replaceById, removeById } from './entities/Roster.js';
import { mountCharacterRoster } from './ui/CharacterRoster.js';
import { mountCharacterSheet } from './ui/CharacterSheet.js';
import { mountInventoryPanel } from './ui/InventoryPanel.js';
import { mountEncounterPanel } from './ui/EncounterPanel.js';
import { mountDiceTray } from './ui/DiceTray.js';
import {
  buildState,
  saveToLocalStorage,
  loadFromLocalStorage,
  downloadState,
  readStateFromFile,
  toTileGrid,
} from './storage/SaveManager.js';

const palette = new TilePalette();

/** A small starter world so the app has something to look at on first run. */
function buildDefaultCampaign() {
  const rng = () => Math.random();
  const grid = new TileGrid();

  let world = createMapNode('world', 'World', null, 8, 6);
  for (let y = 0; y < 6; y++) {
    for (let x = 0; x < 8; x++) {
      const entry =
        y === 2
          ? palette.getRoadPiece(x === 0 ? 'end-w' : x === 7 ? 'end-e' : 'h')
          : palette.pickVariant('grass', rng);
      const inRegionBlock = x < 2 && y < 2;
      world = setTile(
        world,
        createTile(`${x},${y}`, entry.imageRef, inRegionBlock ? { childNodeId: 'region' } : {}),
      );
    }
  }
  grid.addNode(world);

  let region = createMapNode('region', 'Northmarch Region', 'world', 4, 4);
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      region = setTile(region, createTile(`${x},${y}`, palette.pickVariant('forest', rng).imageRef));
    }
  }
  grid.addNode(region);

  let hero = createCharacter('hero', 'Hero', { STR: 14, DEX: 12, CON: 13 });
  hero = addResource(hero, createResource('mana', 'Mana', 'mana', 10));

  return {
    grid,
    party: { nodeId: 'world', tileId: '3,3' },
    characters: [hero],
    encounters: [createEncounter('goblin', 'Goblin', 7)],
  };
}

const saved = loadFromLocalStorage();
const initial = saved
  ? {
      grid: toTileGrid(saved),
      party: saved.party ?? { nodeId: 'world', tileId: '0,0' },
      // An empty roster is legitimate authored state (a GM may have deleted
      // the demo character), so no default character is injected on load.
      characters: saved.characters,
      encounters: saved.encounters,
    }
  : buildDefaultCampaign();

const { grid } = initial;
let { characters, encounters } = initial;

/** @type {'play' | 'build'} */
let currentMode = 'play';
/** @type {string | null} tile id selected for inspection/editing in Build mode */
let selectedTileId = null;
/** @type {import('./ui/PalettePanel.js').Brush} active Build-mode paint brush */
let activeBrush = null;

const navigator = new MapNavigator(grid, initial.party.nodeId);
const partyTracker = new PartyTracker(grid, initial.party);

const breadcrumbContainer = document.getElementById('breadcrumb-container');
const canvasEl = /** @type {HTMLCanvasElement} */ (document.getElementById('map-canvas'));

/**
 * Where the party lands when it first travels into a child node: the child edge
 * facing the direction they approached the region from in the parent map, or the
 * grid centre if that direction can't be determined.
 * @param {import('./types/map.js').MapNode} parent node being viewed when zooming in
 * @param {import('./types/map.js').MapNode} child node being entered
 * @param {string} childNodeId
 * @returns {string} child tile id
 */
function entryTileId(parent, child, childNodeId) {
  const position = partyTracker.getPosition();
  const partyCoords = position.nodeId === parent.id ? parseCoords(position.tileId) : null;
  const group = findRegionGroups(parent).find((g) => g.childNodeId === childNodeId) ?? null;
  const block = group
    ? { minX: group.minX, minY: group.minY, maxX: group.maxX, maxY: group.maxY }
    : null;
  return computeEntryTile(child.width, child.height, block, partyCoords);
}

/** Show the party marker only on the node the party is actually standing in. */
function syncPartyMarker() {
  const position = partyTracker.getPosition();
  mapCanvas.setPartyTile(position.nodeId === navigator.getCurrentNode().id ? position.tileId : null);
}

/** Navigate to a node by id and resync every view that reflects the location. */
function goToNode(nodeId) {
  navigator.goTo(nodeId);
  mapCanvas.setNode(navigator.getCurrentNode());
  clearSelection();
  syncPartyMarker();
  breadcrumb.update(navigator.getBreadcrumb());
  worldTree.update();
}

/** Drop any Build-mode tile selection and its inspector/canvas highlight. */
function clearSelection() {
  selectedTileId = null;
  mapCanvas.setSelectedTile(null);
  inspector.setTile(null);
}

const breadcrumb = mountBreadcrumb(breadcrumbContainer, goToNode);

const worldTree = mountWorldTree(document.getElementById('world-tree-container'), {
  getNodes: () => [...grid.nodes.values()],
  getCurrentId: () => navigator.getCurrentNode().id,
  onSelect: goToNode,
  onAddChild: addChildNode,
  onDelete: deleteNode,
});

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
  ]);
  if (!values) return null;
  const id = freshNodeId();
  const width = Math.max(1, Number(values.width) || 1);
  const height = Math.max(1, Number(values.height) || 1);
  grid.addNode(createMapNode(id, values.name || 'Untitled', parentId, width, height));
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
  }
}

const mapCanvas = new MapCanvas(canvasEl, palette, {
  tileSize: 48,
  getNodeName: (nodeId) => grid.getNode(nodeId)?.name,
  onCellClick: (x, y, tile) => {
    const id = `${x},${y}`;
    // In Build mode a click authors the cell per the active brush, rather than
    // navigating or moving the party (both of which are Play-mode actions). It
    // fires for empty cells too, so a just-erased cell can be painted again.
    if (currentMode === 'build') {
      if (activeBrush === 'erase') {
        applyToTile(id, (node) => eraseTile(node, id));
      } else if (activeBrush) {
        applyToTile(id, (node) => paintTile(node, id, activeBrush.imageRef));
      } else {
        selectTile(id);
      }
      return;
    }
    // Play mode acts only on a real tile; empty cells are inert.
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
          partyTracker.moveTo(child.id, entryTileId(parent, child, tile.childNodeId));
        }
        // Re-read the node: moveTo wrote a new, fog-revealed node into the grid,
        // so the `child` captured above is stale and still fully fogged.
        mapCanvas.setNode(navigator.getCurrentNode());
        breadcrumb.update(navigator.getBreadcrumb());
        worldTree.update();
      }
    } else {
      partyTracker.moveTo(navigator.getCurrentNode().id, tile.id);
      mapCanvas.refreshNode(navigator.getCurrentNode());
    }
    syncPartyMarker();
  },
});

const inspector = mountTileInspector(document.getElementById('inspector-container'), {
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

/** Select a tile within the current node and point the inspector at it. */
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
}

mountPalettePanel(document.getElementById('palette-container'), palette, (brush) => {
  activeBrush = brush;
});

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
  applyToTile(tileId, (node) => paintTile(node, tileId, entry.imageRef));
});

mapCanvas.setNode(navigator.getCurrentNode());
syncPartyMarker();
breadcrumb.update(navigator.getBreadcrumb());

/** @type {string | null} id of the character the sheet/inventory are scoped to */
let selectedCharacterId = characters[0]?.id ?? null;

/** @returns {import('./types/entities.js').Character | null} */
function selectedCharacter() {
  return characters.find((c) => c.id === selectedCharacterId) ?? null;
}

/** Point the sheet and inventory at a character (or null) and refresh the roster. */
function selectCharacter(id) {
  selectedCharacterId = id;
  const character = selectedCharacter();
  characterSheet.setCharacter(character);
  inventoryPanel.setCharacter(character);
  characterRoster.update();
}

/** Write an edited character back into the roster by id. */
function commitCharacter(next) {
  characters = replaceById(characters, next);
  characterRoster.update();
}

const characterRoster = mountCharacterRoster(document.getElementById('party-container'), {
  getCharacters: () => characters,
  getSelectedId: () => selectedCharacterId,
  onSelect: selectCharacter,
  onAdd: async () => {
    const values = await promptModal('New character', [
      { name: 'name', label: 'Name', value: '' },
    ]);
    const name = values?.name.trim();
    if (!name) return;
    characters = [...characters, createCharacter(slugId(name, characters.map((c) => c.id)), name)];
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
  document.getElementById('character-sheet-container'),
  selectedCharacter(),
  (next) => {
    commitCharacter(next);
    inventoryPanel.setCharacter(next);
  },
);

const inventoryPanel = mountInventoryPanel(
  document.getElementById('inventory-container'),
  selectedCharacter(),
  (next) => {
    commitCharacter(next);
    characterSheet.setCharacter(next);
  },
);

mountEncounterPanel(
  document.getElementById('encounter-container'),
  encounters,
  (next) => {
    encounters = next;
  },
  {
    onAdd: async () => {
      const values = await promptModal('New encounter', [
        { name: 'name', label: 'Name', value: '' },
        { name: 'maxHP', label: 'Max HP', type: 'number', value: 10, min: 1 },
      ]);
      const name = values?.name.trim();
      if (!name) return null;
      const maxHP = Math.max(1, Number(values.maxHP) || 1);
      return createEncounter(slugId(name, encounters.map((e) => e.id)), name, maxHP);
    },
    confirmDelete: (encounter) =>
      confirmModal(`Delete "${encounter.name}"?`, { danger: true, confirmLabel: 'Delete' }),
  },
);

mountDiceTray(document.getElementById('dice-tray-container'));

// Play/Build mode drives which rails the layout shows (a body class toggled by
// CSS), and defaults to Play so a first-run visitor lands on the live view.
mountModeSwitch(document.getElementById('mode-switch-container'), currentMode, (mode) => {
  currentMode = mode;
  document.body.classList.toggle('mode-play', mode === 'play');
  document.body.classList.toggle('mode-build', mode === 'build');
  mapCanvas.setRevealAll(mode === 'build');
  if (mode !== 'build') clearSelection();
  worldTree.update();
});

document.getElementById('save-btn').addEventListener('click', () => {
  saveToLocalStorage(buildState(grid, partyTracker.getPosition(), characters, encounters));
});

document.getElementById('export-btn').addEventListener('click', () => {
  downloadState(buildState(grid, partyTracker.getPosition(), characters, encounters));
});

const importInput = /** @type {HTMLInputElement} */ (document.getElementById('import-input'));
document.getElementById('import-btn').addEventListener('click', () => importInput.click());
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
