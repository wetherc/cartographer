import { TileGrid, withNodeDefaults } from '../map/TileGrid.js';
import { downloadJSON, readFileText } from './fileIO.js';

/** @typedef {import('../types/storage.js').CampaignState} CampaignState */
/** @typedef {import('../types/map.js').PartyPosition} PartyPosition */
/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/entities.js').Encounter} Encounter */

const DEFAULT_STORAGE_KEY = 'campaign-builder:save';
const DEFAULT_HISTORY_KEY = 'campaign-builder:history';
const DEFAULT_HISTORY_LIMIT = 10;

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
export function buildState(
  grid,
  party,
  characters,
  encounters,
  travelog = [],
  quests = [],
  extra = {},
) {
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
    splitParty: false,
    combat: null,
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
 * A value only when it is a plain record, else null. Every non-collection
 * field of a save is one, and the load path reads their members directly.
 * @param {unknown} value
 * @returns {any}
 */
function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

/**
 * A save collection as a list of records: anything that is not an array reads
 * as empty, and entries that are not records are dropped. Every collection in
 * a save is a list of entities whose `withDefaults` the load path maps over, so
 * a scalar or null element is unreadable rather than merely odd — and left in
 * place it throws during boot, with the malformed save already persisted.
 * @param {unknown} value
 * @returns {any[]}
 */
function records(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((entry) => record(entry) !== null);
}

/**
 * A finite number, else the fallback. Guards the counters a malformed save can
 * carry as a string or null.
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number}
 */
function number(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * A running combat, or null when the stored value cannot be one. The initiative
 * panel walks `order` and indexes into it, so a combat missing that array is
 * worse than no combat at all.
 * @param {unknown} value
 * @returns {import('../types/combat.js').CombatState | null}
 */
function combatState(value) {
  const combat = record(value);
  if (!combat) return null;
  return {
    round: number(combat.round, 1),
    index: number(combat.index, 0),
    order: records(combat.order),
  };
}

/**
 * The party's position, or null when the stored value cannot be one — both
 * fields are read as tile/node ids without checking.
 * @param {unknown} value
 * @returns {PartyPosition | null}
 */
function partyPosition(value) {
  const party = record(value);
  if (!party || typeof party.nodeId !== 'string' || typeof party.tileId !== 'string') return null;
  return { nodeId: party.nodeId, tileId: party.tileId };
}

/**
 * Parse a serialized campaign, defaulting any missing field to an empty value
 * rather than throwing, so an older or hand-edited save still loads — and
 * coercing every field whose *shape* the load path trusts, so a malformed one
 * cannot. This is the only validation seam a save passes through: Import
 * persists what it reads and then reloads, so an unreadable field that survives
 * here becomes the stored save of an app that no longer boots. Nodes without an
 * id are dropped; `withNodeDefaults` (TileGrid) defends the tiles within.
 * @param {string} json
 * @returns {CampaignState}
 */
export function deserialize(json) {
  const parsed = record(JSON.parse(json)) ?? {};
  return {
    nodes: records(parsed.nodes).filter((node) => typeof node.id === 'string'),
    party: partyPosition(parsed.party),
    characters: records(parsed.characters),
    encounters: records(parsed.encounters),
    travelog: records(parsed.travelog),
    quests: records(parsed.quests),
    clock: record(parsed.clock),
    npcs: records(parsed.npcs),
    handouts: records(parsed.handouts),
    bestiary: records(parsed.bestiary),
    splitParty: parsed.splitParty === true,
    combat: combatState(parsed.combat),
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
 * Warn when a serialized save approaches the ~5 MB localStorage origin quota,
 * leaving headroom for the undo-history ring that shares it. localStorage
 * stores UTF-16 code units, so the byte cost of a string is twice its length.
 */
export const QUOTA_WARN_BYTES = 3 * 1024 * 1024;

/**
 * Approximate localStorage byte cost of a serialized save (UTF-16: two bytes
 * per code unit). Pure.
 * @param {string} json
 * @returns {number}
 */
export function saveByteSize(json) {
  return json.length * 2;
}

/**
 * Whether a save of this size is close enough to the origin quota to warn the
 * GM before writes start throwing. Pure.
 * @param {number} bytes
 * @param {number} [limit]
 * @returns {boolean}
 */
export function isNearQuota(bytes, limit = QUOTA_WARN_BYTES) {
  return bytes >= limit;
}

/**
 * @param {CampaignState} state
 * @param {string} [key]
 */
export function saveToLocalStorage(state, key = DEFAULT_STORAGE_KEY) {
  localStorage.setItem(key, serialize(state));
}

/**
 * Persist a campaign, reporting the outcome instead of throwing: localStorage
 * writes fail (QuotaExceededError) once data: URL images push the origin past
 * its quota, and a silent failure would let a GM believe they saved. `nearQuota`
 * flags a write that succeeded but is approaching the limit.
 * @param {CampaignState} state
 * @param {string} [key]
 * @returns {{ ok: boolean, nearQuota: boolean, bytes: number }}
 */
export function trySaveToLocalStorage(state, key = DEFAULT_STORAGE_KEY) {
  const json = serialize(state);
  const bytes = saveByteSize(json);
  try {
    localStorage.setItem(key, json);
  } catch {
    return { ok: false, nearQuota: true, bytes };
  }
  return { ok: true, nearQuota: isNearQuota(bytes), bytes };
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
  downloadJSON(serialize(state), filename);
}

/**
 * Append a value to a bounded ring, dropping the oldest entries once it
 * exceeds `limit`. Pure: returns a new array, newest last.
 * @template T
 * @param {T[]} history
 * @param {T} snapshot
 * @param {number} [limit]
 * @returns {T[]}
 */
export function pushSnapshot(history, snapshot, limit = DEFAULT_HISTORY_LIMIT) {
  const next = [...history, snapshot];
  return next.length > limit ? next.slice(next.length - limit) : next;
}

/**
 * The undo history ring is stored as one snapshot per localStorage key
 * (`<key>:<seq>`, each holding a raw serialized save) plus a small index of
 * sequence numbers (oldest first) at `<key>`. Pushing a snapshot therefore
 * writes only the new save string and the tiny index — it never re-serializes
 * the older snapshots, which the previous single-array format did on every
 * push (re-stringifying up to `limit` full campaigns, quote-escaping included).
 * @param {string} key
 * @param {number} seq
 * @returns {string}
 */
function historyEntryKey(key, seq) {
  return `${key}:${seq}`;
}

/**
 * Read the history index: the sequence numbers of stored snapshots, oldest
 * first. A missing, corrupt, or legacy-format (array-of-strings) entry reads
 * as an empty history rather than throwing.
 * @param {string} [key]
 * @returns {number[]}
 */
function loadHistoryIndex(key = DEFAULT_HISTORY_KEY) {
  const json = localStorage.getItem(key);
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) && parsed.every((n) => typeof n === 'number') ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * The stored snapshots (raw serialized saves), oldest first, skipping any
 * whose entry key is missing.
 * @param {string} [key]
 * @returns {string[]}
 */
export function loadHistory(key = DEFAULT_HISTORY_KEY) {
  return loadHistoryIndex(key)
    .map((seq) => localStorage.getItem(historyEntryKey(key, seq)))
    .filter((snapshot) => snapshot !== null);
}

/**
 * Remove every stored snapshot and the index itself.
 * @param {string} [key]
 */
export function clearHistory(key = DEFAULT_HISTORY_KEY) {
  for (const seq of loadHistoryIndex(key)) localStorage.removeItem(historyEntryKey(key, seq));
  localStorage.removeItem(key);
}

/**
 * Push an already-serialized save onto the undo history ring. This is the
 * fast path the save/autosave flows use: the persisted save string is pushed
 * as-is, with no JSON parse or re-serialize of the campaign at all. A snapshot
 * identical to the newest stored one is skipped, so saving twice without
 * changes doesn't burn a ring slot.
 * @param {string} snapshot raw serialized CampaignState
 * @param {string} [key]
 * @param {number} [limit]
 */
export function snapshotRawHistory(
  snapshot,
  key = DEFAULT_HISTORY_KEY,
  limit = DEFAULT_HISTORY_LIMIT,
) {
  const seqs = loadHistoryIndex(key);
  const newestSeq = seqs[seqs.length - 1];
  if (seqs.length && snapshot === localStorage.getItem(historyEntryKey(key, newestSeq))) return;
  const seq = seqs.length ? newestSeq + 1 : 0;
  const next = pushSnapshot(seqs, seq, limit);
  const evicted = seqs.filter((s) => !next.includes(s));
  // The ring holds up to `limit` full saves, so it hits the storage quota long
  // before the save itself does. Degrade rather than throw: retry with only
  // this snapshot, and as a last resort drop the history — an unsaveable
  // campaign is worse than a shortened undo trail.
  try {
    localStorage.setItem(historyEntryKey(key, seq), snapshot);
    localStorage.setItem(key, JSON.stringify(next));
  } catch {
    clearHistory(key);
    try {
      localStorage.setItem(historyEntryKey(key, seq), snapshot);
      localStorage.setItem(key, JSON.stringify([seq]));
    } catch {
      localStorage.removeItem(historyEntryKey(key, seq));
      clearHistory(key);
    }
    return;
  }
  for (const s of evicted) localStorage.removeItem(historyEntryKey(key, s));
}

/**
 * Push the current state onto the undo history ring, so a later `undoHistory`
 * can restore it. Call this with the state that is about to be replaced.
 * Callers that already hold the persisted save string should prefer
 * `snapshotPersistedSave`, which skips this serialize.
 * @param {CampaignState} state
 * @param {string} [key]
 * @param {number} [limit]
 */
export function snapshotHistory(state, key = DEFAULT_HISTORY_KEY, limit = DEFAULT_HISTORY_LIMIT) {
  snapshotRawHistory(serialize(state), key, limit);
}

/**
 * Push the currently-persisted save (the raw string in localStorage) onto the
 * undo history ring, without parsing or re-serializing it. No-op when nothing
 * is saved yet.
 * @param {string} [saveKey]
 * @param {string} [historyKey]
 * @param {number} [limit]
 */
export function snapshotPersistedSave(
  saveKey = DEFAULT_STORAGE_KEY,
  historyKey = DEFAULT_HISTORY_KEY,
  limit = DEFAULT_HISTORY_LIMIT,
) {
  const raw = localStorage.getItem(saveKey);
  if (raw) snapshotRawHistory(raw, historyKey, limit);
}

/**
 * Pop the most recent snapshot, persist the shortened ring, and return the
 * restored state, or null when there's nothing to undo. Entries whose stored
 * snapshot has gone missing are skipped and cleaned out of the index.
 * @param {string} [key]
 * @returns {CampaignState | null}
 */
export function undoHistory(key = DEFAULT_HISTORY_KEY) {
  const seqs = loadHistoryIndex(key);
  while (seqs.length) {
    const seq = /** @type {number} */ (seqs.pop());
    const snapshot = localStorage.getItem(historyEntryKey(key, seq));
    localStorage.removeItem(historyEntryKey(key, seq));
    localStorage.setItem(key, JSON.stringify(seqs));
    if (snapshot !== null) return deserialize(snapshot);
  }
  return null;
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
  return readFileText(file).then(deserialize);
}
