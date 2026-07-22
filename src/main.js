import {
  createMapNode,
  createTile,
  setTile,
  getTile,
  updateTileMetadata,
  TileGrid,
} from './map/TileGrid.js';
import { TilePalette } from './map/TilePalette.js';
import { MapCanvas, clientToBuffer, screenToTile } from './map/MapCanvas.js';
import { paintTile, eraseTile } from './map/TilePaint.js';
import { MapNavigator } from './map/MapNavigator.js';
import { mountBreadcrumb } from './ui/Breadcrumb.js';
import { mountModeSwitch } from './ui/ModeSwitch.js';
import { mountWorldTree } from './ui/WorldTree.js';
import { mountTileInspector } from './ui/TileInspector.js';
import { mountPalettePanel } from './ui/PalettePanel.js';
import { PartyTracker } from './party/PartyTracker.js';
import { createCharacter, addResource } from './entities/Character.js';
import { createResource } from './entities/Resource.js';
import { createEncounter } from './entities/Encounter.js';
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
      characters: saved.characters.length ? saved.characters : [createCharacter('hero', 'Hero')],
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
});

const mapCanvas = new MapCanvas(canvasEl, palette, {
  tileSize: 48,
  getNodeName: (nodeId) => grid.getNode(nodeId)?.name,
  onTileClick: (tile) => {
    // In Build mode a click authors the tile per the active brush, rather than
    // navigating or moving the party (both of which are Play-mode actions).
    if (currentMode === 'build') {
      if (activeBrush === 'erase') {
        applyToTile(tile.id, (node) => eraseTile(node, tile.id));
      } else if (activeBrush) {
        applyToTile(tile.id, (node) => paintTile(node, tile.id, activeBrush.imageRef));
      } else {
        selectTile(tile.id);
      }
      return;
    }
    if (tile.childNodeId) {
      if (navigator.zoomIn(tile.id)) {
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
});

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

const characterSheet = mountCharacterSheet(
  document.getElementById('character-sheet-container'),
  characters[0],
  (next) => {
    characters[0] = next;
    inventoryPanel.setCharacter(next);
  },
);

const inventoryPanel = mountInventoryPanel(
  document.getElementById('inventory-container'),
  characters[0],
  (next) => {
    characters[0] = next;
    characterSheet.setCharacter(next);
  },
);

mountEncounterPanel(document.getElementById('encounter-container'), encounters, (next) => {
  encounters = next;
});

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
