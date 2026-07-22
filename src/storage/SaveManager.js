import { TileGrid, withNodeDefaults } from '../map/TileGrid.js';

/** @typedef {import('../types/storage.js').CampaignState} CampaignState */
/** @typedef {import('../types/map.js').PartyPosition} PartyPosition */
/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/entities.js').Encounter} Encounter */

const DEFAULT_STORAGE_KEY = 'campaign-builder:save';

/**
 * Collect the whole campaign (tile hierarchy, party position, characters,
 * encounters) into one plain, JSON-serializable object.
 * @param {TileGrid} grid
 * @param {PartyPosition | null} party
 * @param {Character[]} characters
 * @param {Encounter[]} encounters
 * @returns {CampaignState}
 */
export function buildState(grid, party, characters, encounters) {
  return { nodes: [...grid.nodes.values()], party, characters, encounters };
}

/**
 * @param {CampaignState} state
 * @returns {string}
 */
export function serialize(state) {
  return JSON.stringify(state);
}

/**
 * Parse a serialized campaign, defaulting any missing field to an empty
 * value rather than throwing, so an older or hand-edited save still loads.
 * @param {string} json
 * @returns {CampaignState}
 */
export function deserialize(json) {
  const parsed = JSON.parse(json);
  return {
    nodes: parsed.nodes ?? [],
    party: parsed.party ?? null,
    characters: parsed.characters ?? [],
    encounters: parsed.encounters ?? [],
  };
}

/**
 * Rebuild a TileGrid from a CampaignState's flat node list.
 * @param {CampaignState} state
 * @returns {TileGrid}
 */
export function toTileGrid(state) {
  const grid = new TileGrid();
  // Backfill kind/environ so nodes from saves predating interiors load cleanly.
  for (const node of state.nodes) grid.addNode(withNodeDefaults(node));
  return grid;
}

/**
 * @param {CampaignState} state
 * @param {string} [key]
 */
export function saveToLocalStorage(state, key = DEFAULT_STORAGE_KEY) {
  localStorage.setItem(key, serialize(state));
}

/**
 * @param {string} [key]
 * @returns {CampaignState | null}
 */
export function loadFromLocalStorage(key = DEFAULT_STORAGE_KEY) {
  const json = localStorage.getItem(key);
  return json ? deserialize(json) : null;
}

/**
 * Trigger a browser download of the campaign as a .json file.
 * @param {CampaignState} state
 * @param {string} [filename]
 */
export function downloadState(state, filename = 'campaign.json') {
  const blob = new Blob([serialize(state)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Read a campaign from a File (e.g. from a file input's change event).
 * @param {File} file
 * @returns {Promise<CampaignState>}
 */
export function readStateFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(deserialize(String(reader.result)));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
