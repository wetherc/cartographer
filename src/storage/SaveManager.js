import { TileGrid, withNodeDefaults } from '../map/TileGrid.js';

/** @typedef {import('../types/storage.js').CampaignState} CampaignState */
/** @typedef {import('../types/map.js').PartyPosition} PartyPosition */
/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/entities.js').Encounter} Encounter */

const DEFAULT_STORAGE_KEY = 'campaign-builder:save';
const DEFAULT_HISTORY_KEY = 'campaign-builder:history';
const DEFAULT_HISTORY_LIMIT = 20;

/** The localStorage key the campaign save lives under, exposed for cross-tab sync. */
export const STORAGE_KEY = DEFAULT_STORAGE_KEY;

/**
 * Collect the whole campaign (tile hierarchy, party position, characters,
 * encounters) into one plain, JSON-serializable object.
 * @param {TileGrid} grid
 * @param {PartyPosition | null} party
 * @param {Character[]} characters
 * @param {Encounter[]} encounters
 * @param {import('../types/log.js').LogEntry[]} [travelog]
 * @param {import('../types/quest.js').Quest[]} [quests]
 * @param {Partial<CampaignState>} [extra] later-added top-level fields (clock, npcs, ...)
 * @returns {CampaignState}
 */
export function buildState(grid, party, characters, encounters, travelog = [], quests = [], extra = {}) {
  return {
    nodes: [...grid.nodes.values()],
    party,
    characters,
    encounters,
    travelog,
    quests,
    clock: null,
    npcs: [],
    handouts: [],
    bestiary: [],
    ...extra,
  };
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
    travelog: parsed.travelog ?? [],
    quests: parsed.quests ?? [],
    clock: parsed.clock ?? null,
    npcs: parsed.npcs ?? [],
    handouts: parsed.handouts ?? [],
    bestiary: parsed.bestiary ?? [],
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
 * Append a serialized snapshot to a bounded history ring, dropping the oldest
 * entries once it exceeds `limit`. Pure: returns a new array, newest last.
 * @param {string[]} history
 * @param {string} snapshot
 * @param {number} [limit]
 * @returns {string[]}
 */
export function pushSnapshot(history, snapshot, limit = DEFAULT_HISTORY_LIMIT) {
  const next = [...history, snapshot];
  return next.length > limit ? next.slice(next.length - limit) : next;
}

/**
 * Read the undo history ring (newest last), tolerating a missing or corrupt
 * entry by returning an empty list.
 * @param {string} [key]
 * @returns {string[]}
 */
export function loadHistory(key = DEFAULT_HISTORY_KEY) {
  const json = localStorage.getItem(key);
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Push the current state onto the undo history ring, so a later `undoHistory`
 * can restore it. Call this with the state that is about to be replaced.
 * @param {CampaignState} state
 * @param {string} [key]
 * @param {number} [limit]
 */
export function snapshotHistory(state, key = DEFAULT_HISTORY_KEY, limit = DEFAULT_HISTORY_LIMIT) {
  localStorage.setItem(key, JSON.stringify(pushSnapshot(loadHistory(key), serialize(state), limit)));
}

/**
 * Pop the most recent snapshot, persist the shortened ring, and return the
 * restored state, or null when there's nothing to undo.
 * @param {string} [key]
 * @returns {CampaignState | null}
 */
export function undoHistory(key = DEFAULT_HISTORY_KEY) {
  const history = loadHistory(key);
  const snapshot = history.pop();
  if (snapshot === undefined) return null;
  localStorage.setItem(key, JSON.stringify(history));
  return deserialize(snapshot);
}

/**
 * Whether a `storage` event represents another tab writing a new campaign save
 * (as opposed to a history-key write, a clear, or a no-op). The browser fires
 * `storage` only in tabs *other* than the one that made the change, so a driving
 * tab never sees its own saves — this is the seam a follower tab watches. Pure.
 * @param {StorageEvent} event
 * @param {string} [key]
 * @returns {boolean}
 */
export function isExternalSaveEvent(event, key = DEFAULT_STORAGE_KEY) {
  return event.key === key && event.newValue != null && event.newValue !== event.oldValue;
}

/**
 * Subscribe to campaign saves made in other tabs of the same origin, the
 * minimum-viable multi-device story (GM tab drives, follower tabs react). No
 * server, no dependencies — just the `storage` event. Returns an unsubscribe.
 * @param {() => void} callback run when another tab writes a new save
 * @param {string} [key]
 * @returns {() => void}
 */
export function onExternalSave(callback, key = DEFAULT_STORAGE_KEY) {
  const handler = (/** @type {StorageEvent} */ event) => {
    if (isExternalSaveEvent(event, key)) callback();
  };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
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
