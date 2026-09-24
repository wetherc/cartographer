/**
 * This module implements undo and redo as a log of invertible deltas against
 * the persisted campaign. It replaces an earlier ring of whole-campaign
 * snapshots.
 *
 * The ring stored up to ten complete serialized saves beside the canonical
 * save. Each history step cost a whole campaign, and each save wrote twice
 * the campaign's bytes synchronously. The ring also offered no redo, because
 * a stack of past states cannot describe a future state.
 * A log of deltas costs only the size of the edit. Redo uses the same
 * structure: each op records its old value and its new value, so `invertOps`
 * only swaps the two. Undo and redo are the same walk in opposite directions.
 *
 * Storage layout: one key per record, so a push is one small write.
 *
 * - `campaign-builder:history`: the index, `{ version, deltas, cursor }`.
 *   `deltas` is the ordered list of sequence numbers. `cursor` is how many of
 *   them the persisted save currently reflects. Deltas past the cursor are
 *   the redo tail.
 * - `campaign-builder:history:d<seq>`: one record. A delta record is a
 *   `JSON.stringify`d list of ops. A snapshot record is `snapshot:` followed
 *   by the stored save string on the other side of the step.
 *
 * A step that replaces the whole campaign (New, Load example, Import)
 * stores a snapshot record, because its ops contain both worlds and a
 * snapshot contains only one, in the packed save form. Undo and redo swap
 * a snapshot record with the current save string, so the record always
 * contains the state across the step from the cursor.
 *
 * This module deliberately stores no base snapshot: a packed campaign that
 * the log applies onto. The canonical save already holds that state, and
 * undo and redo apply a delta only to the *current* state, never to a stored
 * base.
 * A base snapshot's only remaining job is to let the oldest deltas fold into
 * it at the byte cap. Dropping those deltas instead has the same effect: it
 * costs undo depth either way, and it avoids rewriting a multi-megabyte base
 * synchronously on every cap hit.
 * A base snapshot also lets the app replay base plus log at load time. If
 * the app does this, it does not need to write the canonical save at all.
 * This idea is out of scope here. Adding it back is what restores a base
 * snapshot to this module.
 *
 * The `version` field on the index makes an app upgrade safe. This module
 * never migrates a delta: an app version writes a delta against a specific
 * `CampaignState` shape. A log stamped with any version other than the
 * current schema version is discarded, not applied. Each app upgrade costs
 * undo depth. Pre-GA save compatibility allows this cost.
 *
 * One property of the ring is worth keeping: a push moves strings around
 * instead of parsing and re-stringifying a campaign. A diff cannot keep this
 * property, because it needs the previous state as a value.
 * This module pays that cost once. It caches the last persisted state in
 * memory, stamped with the raw string it came from. In the normal case, this
 * costs one `getItem` call and one string comparison.
 * The stamp is also a correctness guard. A tab that declines the cross-tab
 * reload prompt keeps editing against a save that another tab has since
 * replaced. Comparing the raw string catches this case. Without the stamp, a
 * plain cache diffs against a state that is no longer stored.
 *
 * Every write in this module happens after the campaign write, never before.
 * The index must never describe a state that was not stored. A quota
 * failure costs undo depth rather than the whole log, and this module
 * reports the failure. Undo silently becoming single-step is the defect that
 * this reporting contract exists to catch.
 */

import { applyOps, diffState, invertOps } from './StateDiff.js';
import { CURRENT_VERSION } from './Migrations.js';
import { STORAGE_KEY, deserialize, trySaveToLocalStorage } from './SaveManager.js';
import { loadAssetTable } from './AssetStore.js';
import { clamp } from '../util/num.js';
import { removeStored, storedLength, writeStored } from './Footprint.js';

/** @typedef {import('../types/storage.js').CampaignState} CampaignState */
/** @typedef {import('../types/storage.js').DiffOp} DiffOp */
/** @typedef {{ version: number, log: string, deltas: number[], cursor: number }} HistoryIndex */
/** @typedef {{ ok: boolean, evictedAll: boolean }} HistoryResult */
/** @typedef {{ ops: DiffOp[] } | { snapshot: string }} HistoryRecord */

/**
 * The prefix of a snapshot record. The rest of the record is a stored save
 * string. A delta record is a JSON array, so it starts with `[` and never
 * with this prefix.
 */
const SNAPSHOT_PREFIX = 'snapshot:';

/** The localStorage key that holds the history index. */
export const HISTORY_KEY = 'campaign-builder:history';

/**
 * How many bytes of deltas this module keeps. The ring it replaces cost ten
 * whole campaigns (0.73 MB for the example campaign). This cap gives more
 * undo depth and uses less storage for any realistic edit. The cap still
 * bounds a log, because a single handout insertion can add 250,000
 * characters in one step.
 */
export const HISTORY_BYTE_CAP = 512 * 1024;

/** @type {HistoryIndex} */
const EMPTY_INDEX = { version: CURRENT_VERSION, log: '', deltas: [], cursor: 0 };

/**
 * A random id for a fresh log. Sequence numbers restart at zero after
 * `clearHistoryLog`, so a bare sequence number can name two different states
 * across log generations. Every position this module hands out carries the
 * log id beside the number, and a position from a cleared log then matches
 * nothing in the log that replaced it. Collision odds are irrelevant here:
 * a wrong match costs a follower one delta applied to the wrong base, and
 * two ids colliding needs the same random draw in the same origin.
 * @returns {string}
 */
function newLogId() {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * The last persisted campaign as a value. This module stamps it with the raw
 * string it was parsed from, so a save from another tab invalidates the
 * cache.
 * @type {{ raw: string, state: CampaignState } | null}
 */
let cached = null;

/**
 * @param {number} seq
 * @returns {string}
 */
function deltaKey(seq) {
  return `${HISTORY_KEY}:d${seq}`;
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Delete the index and every record under it. This module scans by key
 * prefix instead of walking the index, so it also deletes the previous
 * ring's `<key>:<seq>` snapshots. The upgrade path deletes these snapshots
 * instead of converting them, because a whole-campaign snapshot is not a
 * delta and cannot become one.
 */
export function clearHistoryLog() {
  /** @type {string[]} */
  const doomed = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key === HISTORY_KEY || key?.startsWith(`${HISTORY_KEY}:`)) doomed.push(key);
  }
  for (const key of doomed) removeStored(key);
}

/**
 * The stored index, or an empty index when none exists. This function clears
 * the whole log instead of partially trusting anything unreadable: a corrupt
 * record, the previous ring's array of sequence numbers, or a log written
 * under an older schema version. A delta that does not match this app's
 * state shape corrupts the campaign it is applied to.
 * @returns {HistoryIndex}
 */
function readIndex() {
  const raw = localStorage.getItem(HISTORY_KEY);
  if (!raw) return { ...EMPTY_INDEX };
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    clearHistoryLog();
    return { ...EMPTY_INDEX };
  }
  const record = /** @type {Record<string, unknown>} */ (parsed);
  if (!isRecord(parsed) || record.version !== CURRENT_VERSION) {
    clearHistoryLog();
    return { ...EMPTY_INDEX };
  }
  const deltas = Array.isArray(record.deltas)
    ? record.deltas.filter((seq) => typeof seq === 'number' && Number.isFinite(seq))
    : [];
  const stored = record.cursor;
  const cursor =
    typeof stored === 'number' && Number.isFinite(stored)
      ? clamp(Math.trunc(stored), 0, deltas.length)
      : deltas.length;
  const log = typeof record.log === 'string' ? record.log : '';
  return { version: CURRENT_VERSION, log, deltas, cursor };
}

/**
 * @param {HistoryIndex} index
 * @returns {boolean} whether the write landed
 */
function writeIndex(index) {
  try {
    writeStored(HISTORY_KEY, JSON.stringify(index));
    return true;
  } catch {
    return false;
  }
}

/**
 * One stored record, or null when its key is missing or unreadable. This
 * function tolerates a missing key instead of throwing an error on it. An
 * error on a load or undo path leaves the GM unable to recover the campaign.
 * @param {number} seq
 * @returns {HistoryRecord | null}
 */
function readRecord(seq) {
  const raw = localStorage.getItem(deltaKey(seq));
  if (!raw) return null;
  if (raw.startsWith(SNAPSHOT_PREFIX)) return { snapshot: raw.slice(SNAPSHOT_PREFIX.length) };
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? { ops: parsed } : null;
  } catch {
    return null;
  }
}

/**
 * The ops of one stored delta, or null when the record is missing,
 * unreadable, or a snapshot.
 * @param {number} seq
 * @returns {DiffOp[] | null}
 */
function readDelta(seq) {
  const record = readRecord(seq);
  return record && 'ops' in record ? record.ops : null;
}

/**
 * The sequence number for the next record of this log.
 * @param {HistoryIndex} index
 * @returns {number}
 */
function nextSeq(index) {
  return Math.max(-1, ...index.deltas) + 1;
}

/**
 * The persisted campaign as a value, or null when nothing is stored. This
 * function reuses the cache only when the stored string still matches the
 * string the cache was built from. Otherwise it parses the save and caches
 * the result. An unreadable save throws, as `deserialize` does.
 *
 * The startup path loads through this function instead of
 * `loadFromLocalStorage`, so the cache is warm from the first save on. The
 * first save of a session otherwise parsed the stored string a second time
 * and diffed two states that shared no object, which at a large world cost
 * more than a hundred milliseconds. Because `toTileGrid` keeps the parsed
 * node objects, the live nodes are the cached ones, and the first diff runs
 * by identity like every later one.
 * @returns {CampaignState | null}
 */
export function loadPersistedCampaign() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) return null;
  if (cached && cached.raw === raw) return cached.state;
  const state = deserialize(raw, loadAssetTable());
  cached = { raw, state };
  return state;
}

/**
 * `loadPersistedCampaign`, with an unreadable save read as nothing stored.
 * A history step must not throw over a save it cannot read.
 * @returns {CampaignState | null}
 */
function lastPersisted() {
  try {
    return loadPersistedCampaign();
  } catch {
    return null;
  }
}

/**
 * Remove the oldest deltas until the log fits the byte cap. Return the
 * surviving sequence numbers, and remove the corresponding keys. Hitting the
 * cap is by design, not a failure, so this function does not report it as
 * lost depth. The alternative, an unbounded log, puts the origin over quota.
 * @param {number[]} deltas
 * @returns {number[]}
 */
function trimToCap(deltas) {
  // The ledger already holds each delta's length, so no delta is read again.
  const sizes = deltas.map((seq) => storedLength(deltaKey(seq)) * 2);
  let total = sizes.reduce((sum, size) => sum + size, 0);
  let drop = 0;
  while (total > HISTORY_BYTE_CAP && drop < deltas.length - 1) {
    total -= sizes[drop];
    drop += 1;
  }
  for (const seq of deltas.slice(0, drop)) removeStored(deltaKey(seq));
  return deltas.slice(drop);
}

/**
 * The record for the step from `before` to `after`, or null when the step
 * changes nothing. Saving an unchanged campaign again is not a history step.
 *
 * The record is the delta, or a snapshot of the replaced save when the
 * snapshot is the smaller of the two. A replacing step (New, Load example,
 * Import) diffs to ops that hold both whole worlds, unpacked, and the
 * packed save string of the old world is several times smaller. A small
 * edit to a large campaign keeps its delta.
 * @param {CampaignState} before
 * @param {string} beforeRaw the stored string that `before` was parsed from
 * @param {CampaignState} after
 * @returns {string | null}
 */
function stepRecord(before, beforeRaw, after) {
  const ops = diffState(before, after);
  if (!ops.length) return null;
  const json = JSON.stringify(ops);
  return json.length > beforeRaw.length ? SNAPSHOT_PREFIX + beforeRaw : json;
}

/**
 * Append one record and remove any redo tail that the new edit
 * invalidates. `ok` states whether this step is undoable, and `evictedAll`
 * states whether a full origin cost the GM depth beyond the ordinary cap.
 * A record larger than the whole cap stays as the only step, because
 * `trimToCap` always keeps the newest record.
 * @param {string} record
 * @returns {HistoryResult}
 */
function recordStep(record) {
  const index = readIndex();
  const seq = nextSeq(index);
  const tail = index.deltas.slice(index.cursor);
  const deltas = [...index.deltas.slice(0, index.cursor), seq];
  let evictedAll = false;
  for (;;) {
    try {
      writeStored(deltaKey(seq), record);
      break;
    } catch {
      // A full origin degrades depth first: give up the oldest step and
      // retry the write, instead of losing the whole log for one write.
      if (deltas.length < 2) {
        clearHistoryLog();
        return { ok: false, evictedAll: true };
      }
      const oldest = /** @type {number} */ (deltas.shift());
      removeStored(deltaKey(oldest));
      evictedAll = true;
    }
  }
  const kept = trimToCap(deltas);
  const log = index.log || newLogId();
  // The index write happens last. An index that names a key that was never
  // written describes a history step that cannot be applied. An unnamed key
  // is only unused data.
  if (!writeIndex({ version: CURRENT_VERSION, log, deltas: kept, cursor: kept.length })) {
    clearHistoryLog();
    return { ok: false, evictedAll: true };
  }
  for (const dropped of tail) removeStored(deltaKey(dropped));
  return { ok: true, evictedAll };
}

/**
 * Persist a campaign and record the step that produced it. This is the only
 * save path. This module writes the record after the campaign, so a failed
 * campaign write leaves the log describing exactly what is stored. A
 * snapshot record references the images of the replaced save, so the save
 * keeps those images in the payload table.
 *
 * Nothing is recorded when nothing readable is stored to diff against: a
 * first save, or a stored save that this app cannot read. Either way, the
 * campaign is now the oldest state there is.
 * @param {CampaignState} state
 * @returns {ReturnType<typeof trySaveToLocalStorage> & { history: HistoryResult }}
 */
export function saveCampaign(state) {
  const before = lastPersisted();
  // `lastPersisted` leaves the cache on the string it parsed.
  const record = before && cached ? stepRecord(before, cached.raw, state) : null;
  const keepPrevious = record !== null && record.startsWith(SNAPSHOT_PREFIX);
  const save = trySaveToLocalStorage(state, STORAGE_KEY, { keepPrevious });
  if (!save.ok) return { ...save, history: { ok: true, evictedAll: false } };
  cached = { raw: save.json, state };
  return { ...save, history: record ? recordStep(record) : { ok: true, evictedAll: false } };
}

/** @typedef {{ save: ReturnType<typeof trySaveToLocalStorage>, state: CampaignState }} StepResult */

/**
 * Move the cursor by one record and persist the state it names. Undo and
 * redo share this function. They differ only in which record they read and
 * which way they apply it. This function returns null when there is
 * nothing in that direction.
 * @param {number} direction -1 to undo, 1 to redo
 * @returns {StepResult | null}
 */
function step(direction) {
  const index = readIndex();
  const at = direction < 0 ? index.cursor - 1 : index.cursor;
  if (at < 0 || at >= index.deltas.length) return null;
  const record = readRecord(index.deltas[at]);
  if (!record) {
    // The step's own record is gone. Neither direction of the log can
    // describe the campaign correctly anymore.
    clearHistoryLog();
    return null;
  }
  return 'ops' in record
    ? applyDelta(index, direction, record.ops)
    : swapSnapshot(index, at, direction, record.snapshot);
}

/**
 * Step across a delta record. This writes the campaign first and the index
 * second, for the same reason a save records after writing: the cursor
 * never claims a state that was not stored. An index write that fails
 * clears the log, because the old cursor applies the same delta again to a
 * state that already has it.
 * @param {HistoryIndex} index
 * @param {number} direction
 * @param {DiffOp[]} ops
 * @returns {StepResult | null}
 */
function applyDelta(index, direction, ops) {
  const current = lastPersisted();
  if (!current) return null;
  /** @type {CampaignState} */
  let restored;
  try {
    restored = applyOps(current, direction < 0 ? invertOps(ops) : ops);
  } catch {
    clearHistoryLog();
    return null;
  }
  const save = trySaveToLocalStorage(restored);
  if (!save.ok) return { save, state: restored };
  cached = { raw: save.json, state: restored };
  if (!writeIndex({ ...index, cursor: index.cursor + direction })) clearHistoryLog();
  return { save, state: restored };
}

/**
 * Step across a snapshot record. The record holds the save on the other
 * side of the step. This writes that save, then stores the current save
 * string in a new record at the same position, so the next step in the
 * opposite direction swaps the two back. The current save is read only as
 * a string, so this also restores a campaign from under a stored save that
 * this app cannot parse.
 * @param {HistoryIndex} index
 * @param {number} at the position of the record in `index.deltas`
 * @param {number} direction
 * @param {string} snapshot
 * @returns {StepResult | null}
 */
function swapSnapshot(index, at, direction, snapshot) {
  const currentRaw = localStorage.getItem(STORAGE_KEY);
  if (currentRaw === null) return null;
  /** @type {CampaignState} */
  let restored;
  try {
    restored = deserialize(snapshot, loadAssetTable());
  } catch {
    clearHistoryLog();
    return null;
  }
  // The new record references the images of the save this write replaces.
  const save = trySaveToLocalStorage(restored, STORAGE_KEY, { keepPrevious: true });
  if (!save.ok) return { save, state: restored };
  cached = { raw: save.json, state: restored };
  const seq = nextSeq(index);
  const cursor = index.cursor + direction;
  /** @type {{ deltas: number[], cursor: number }} */
  let next;
  try {
    writeStored(deltaKey(seq), SNAPSHOT_PREFIX + currentRaw);
    next = { deltas: index.deltas.map((old, i) => (i === at ? seq : old)), cursor };
  } catch {
    // No step can cross back over this position without the new record.
    // Only the records on the restored side of it still apply.
    next =
      direction < 0
        ? { deltas: index.deltas.slice(0, at), cursor }
        : { deltas: index.deltas.slice(at + 1), cursor: 0 };
  }
  if (!writeIndex({ ...index, ...next })) {
    clearHistoryLog();
    return { save, state: restored };
  }
  for (const old of index.deltas) if (!next.deltas.includes(old)) removeStored(deltaKey(old));
  return { save, state: restored };
}

/**
 * The position of the delta at `at` in this log, as an opaque token, or null
 * when `at` sits before the first delta. The token pairs the log id with the
 * sequence number, so a position outlives nothing: a cleared and restarted
 * log reuses sequence numbers but never the id.
 * @param {HistoryIndex} index
 * @param {number} at a cursor value: how many deltas the position reflects
 * @returns {string | null}
 */
function positionToken(index, at) {
  return at > 0 ? `${index.log}:${index.deltas[at - 1]}` : null;
}

/**
 * The position the persisted save currently reflects. A tab records this
 * token whenever its live state matches the persisted save: at load, after
 * its own save, and after adopting another tab's save. `planAdoption` later
 * compares the recorded token against the log.
 * @returns {string | null}
 */
export function historyPosition() {
  const index = readIndex();
  return positionToken(index, index.cursor);
}

/**
 * How a tab holding the state recorded at `held` can adopt the save another
 * tab just wrote.
 *
 * `delta` comes back only when the persisted save is exactly one recorded
 * delta ahead of `held`: the cursor sits at the head, the delta before the
 * head is the one the tab holds, and the head delta itself is readable. The
 * ops then carry the held state to the persisted one. This also covers a
 * redo, and a save made from an undone cursor, because both leave the held
 * position one behind the head.
 *
 * `current` means the persisted save is the state the tab already holds.
 *
 * Everything else is `full`: a null or foreign position, a gap of more than
 * one delta, a cursor away from the head (an undo), an empty or cleared log,
 * or an unreadable delta record. The caller then re-reads the whole save.
 * @param {string | null} held
 * @returns {{ kind: 'current' | 'full' } | { kind: 'delta', ops: DiffOp[] }}
 */
export function planAdoption(held) {
  const index = readIndex();
  const len = index.deltas.length;
  if (held === null || index.cursor !== len || len === 0) return { kind: 'full' };
  if (held === positionToken(index, len)) return { kind: 'current' };
  if (len < 2 || held !== positionToken(index, len - 1)) return { kind: 'full' };
  const ops = readDelta(index.deltas[len - 1]);
  return ops ? { kind: 'delta', ops } : { kind: 'full' };
}

/**
 * Restore the state before the most recent recorded edit, and persist it.
 * This function returns null when there is nothing to undo.
 * @returns {{ save: ReturnType<typeof trySaveToLocalStorage>, state: CampaignState } | null}
 */
export function undoCampaign() {
  return step(-1);
}

/**
 * Reapply the edit that the last undo reversed, and persist the result. This
 * function returns null when the cursor is already at the head.
 * @returns {{ save: ReturnType<typeof trySaveToLocalStorage>, state: CampaignState } | null}
 */
export function redoCampaign() {
  return step(1);
}

/**
 * How many undo and redo steps are currently available. The header controls
 * use this value to decide whether to enable themselves.
 * @returns {{ undo: number, redo: number }}
 */
export function historyDepth() {
  const index = readIndex();
  return { undo: index.cursor, redo: index.deltas.length - index.cursor };
}
