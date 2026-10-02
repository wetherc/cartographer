/**
 * This module implements undo and redo as a log of invertible deltas against
 * the persisted campaign. A delta costs only the size of the edit. Each op
 * records its old value and its new value, so `invertOps` only swaps the
 * two, and redo reads the same records as undo. Undo and redo are the same
 * walk in opposite directions.
 *
 * Storage layout: one key per record, so a push is one small write.
 *
 * - `campaign-builder:history`: the index,
 *   `{ version, log, deltas, cursor, snapshots, baseMark }`. `deltas` is the
 *   ordered list of sequence numbers. `cursor` is how many of them the
 *   persisted save currently reflects. Deltas past the cursor are the redo
 *   tail. `snapshots` lists the sequence numbers whose record is a snapshot,
 *   so the byte budget of `HistoryBudget.js` can tell the two kinds apart
 *   from the footprint ledger alone. An index without it counts every record
 *   as a delta. `baseMark` is the save mark of the save that the log's first
 *   record (sequence number 0) applies to, or null when it is not known.
 * - `campaign-builder:history:d<seq>`: one record. A delta record is
 *   `delta:` followed by a `JSON.stringify`d list of ops. A snapshot record
 *   is `snapshot:` followed by the stored save string on the other side of
 *   the step.
 *
 * A step that replaces the whole campaign (New, Load example, Import)
 * stores a snapshot record, because its ops contain both worlds and a
 * snapshot contains only one, in the packed save form. Undo and redo swap
 * a snapshot record with the current save string, so the record always
 * contains the state across the step from the cursor.
 *
 * This module stores no base snapshot: a packed campaign that the log
 * applies onto. The canonical save already contains that state, and undo and
 * redo apply a delta only to the *current* state, never to a stored base.
 * At the byte cap, the oldest deltas drop instead of folding into a base,
 * which avoids a synchronous rewrite of a multi-megabyte base on every cap
 * hit. The cost in undo depth is the same either way. Replaying a base plus
 * the log at load time, so that the app does not write the canonical save
 * at all, needs a base snapshot. That idea is out of scope here.
 *
 * The `version` field on the index makes an app upgrade safe. This module
 * never migrates a delta, because an app version writes a delta against
 * one `CampaignState` format. A log stamped with any version other than the
 * current schema version is discarded, not applied. Each app upgrade costs
 * undo depth. Pre-GA save compatibility allows this cost.
 *
 * A diff needs the previous state as a value, and parsing the stored save
 * on every push costs a whole campaign's parse. This module caches the last
 * persisted state in memory, stamped with the raw string it came from and
 * the save mark stored with it. In the normal case, this costs one read of
 * the short save mark, and the whole save string is read only when the mark
 * is missing or differs.
 * The stamp also guards the diff. A tab that declines the cross-tab reload
 * prompt keeps editing against a save that another tab has since replaced.
 * A new mark or a new raw string catches this case. A plain cache would diff
 * against a state that is no longer stored.
 *
 * Every history write in this module happens after the campaign write,
 * never before. Only the removal of the save mark comes first.
 * An index that describes a state that was not stored applies a delta to
 * the wrong base. A quota failure costs undo depth rather than the whole
 * log, and this module reports the failure. Without the report, undo drops
 * to a single step with no notice.
 *
 * The save mark (`SaveManager.SAVE_MARK_KEY`) is the last write of every
 * save and every undo or redo step. Another tab adopts a save only on the
 * mark's `storage` event, because at the campaign key's event its view of
 * the index still names the previous step.
 */

import { applyOps, diffState, invertOps } from './StateDiff.js';
import { compactOps, expandOps, historyForm, opsNameAssets } from './HistoryCodec.js';
import { ASSET_PREFIX, restoreAssets } from './Assets.js';
import { CURRENT_VERSION } from './Migrations.js';
import {
  STORAGE_KEY,
  deserialize,
  packState,
  clearSaveMark,
  readSaveMark,
  trySaveToLocalStorage,
  writeSaveMark,
} from './SaveManager.js';
import { detachAssets } from './AssetStore.js';
import { mirrorActive, storedAssetTable } from './AssetMirror.js';
import { clamp } from '../util/num.js';
import {
  QUOTA_BYTES,
  footprintWhere,
  removeStored,
  storedLength,
  writeStored,
} from './Footprint.js';
import { newestSnapshot, olderSnapshotRoom, recordsToDrop, snapshotFits } from './HistoryBudget.js';

/** @typedef {import('../types/storage.js').CampaignState} CampaignState */
/** @typedef {import('../types/storage.js').DiffOp} DiffOp */
/** @typedef {{ version: number, log: string, deltas: number[], cursor: number, snapshots: number[], baseMark: string | null }} HistoryIndex */
/** @typedef {{ ok: boolean, evictedAll: boolean }} HistoryResult */
/** @typedef {{ ops: DiffOp[] } | { snapshot: string }} HistoryRecord */

/**
 * The prefix of a snapshot record. The rest of the record is a stored save
 * string.
 */
const SNAPSHOT_PREFIX = 'snapshot:';

/**
 * The prefix of a delta record. The rest of the record is a JSON list of
 * ops, which can hold the compact node ops of `HistoryCodec.js`. A tab that
 * still runs an app version without those ops reads a record with this
 * prefix as unreadable and takes its full load path. Read as a plain list,
 * a `node` op inserts an encoded node into the live state, and that tab's
 * next save writes the node with most of its tiles gone. A record that is
 * a bare JSON list holds plain ops only, and it still applies.
 */
const DELTA_PREFIX = 'delta:';

/** The localStorage key that holds the history index. */
export const HISTORY_KEY = 'campaign-builder:history';

/**
 * How many bytes of delta records this module keeps. Without a cap, a log
 * of large edits (a region generated or regenerated, a custom tile painted
 * over a whole node) grows until the origin is over quota. Snapshot records
 * do not count here. They have their own budget in `HistoryBudget.js`.
 */
export const HISTORY_BYTE_CAP = 512 * 1024;

/** @type {HistoryIndex} */
const EMPTY_INDEX = {
  version: CURRENT_VERSION,
  log: '',
  deltas: [],
  cursor: 0,
  snapshots: [],
  baseMark: null,
};

/**
 * The most records that `planAdoption` walks. Each record costs the follower
 * one `applyOps` pass, so a long walk costs more than the full read it
 * replaces.
 */
export const ADOPTION_WALK = 8;

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
 * cache. `mark` is the save mark that was stored with that string, or null
 * when it is not known. While the stored mark equals it, the stored string
 * is still `raw`, and a read skips the whole save string.
 * @type {{ raw: string, state: CampaignState, mark: string | null } | null}
 */
let cached = null;

/**
 * Write a campaign with `trySaveToLocalStorage`, and cache it on success.
 * The save mark goes right before the campaign write, so for the time
 * between this write and the new mark no tab reads the old mark as proof
 * that nothing moved. A save that waits on an image put writes nothing and
 * keeps the mark.
 * @param {CampaignState} state
 * @param {Parameters<typeof trySaveToLocalStorage>[2]} [options]
 * @returns {ReturnType<typeof trySaveToLocalStorage>}
 */
function writeCampaign(state, options) {
  const save = trySaveToLocalStorage(state, STORAGE_KEY, {
    ...options,
    beforeWrite: clearSaveMark,
  });
  if (save.ok) cached = { raw: save.json, state, mark: null };
  return save;
}

/**
 * Write a new save mark after a step that stored a campaign, and remember
 * it beside the cache.
 * @returns {string | null}
 */
function markSave() {
  const mark = writeSaveMark();
  if (cached) cached.mark = mark;
  return mark;
}

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
 * prefix instead of walking the index, so it also deletes a key under the
 * prefix that the index does not name, such as a record whose index write
 * failed.
 * @returns {boolean} whether any key was removed
 */
export function clearHistoryLog() {
  /** @type {string[]} */
  const doomed = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key === HISTORY_KEY || key?.startsWith(`${HISTORY_KEY}:`)) doomed.push(key);
  }
  for (const key of doomed) removeStored(key);
  return doomed.length > 0;
}

/**
 * The stored index, or an empty index when none exists. This function clears
 * the whole log instead of partially trusting anything unreadable: a corrupt
 * record, an index that is not a record, or a log written under an older
 * schema version. A delta that does not match this app's state format
 * corrupts the campaign it is applied to.
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
  const snapshots = Array.isArray(record.snapshots)
    ? record.snapshots.filter((seq) => deltas.includes(seq))
    : [];
  const baseMark = typeof record.baseMark === 'string' ? record.baseMark : null;
  return { version: CURRENT_VERSION, log, deltas, cursor, snapshots, baseMark };
}

/**
 * Write the index. `snapshots` keeps only the records that `deltas` still
 * names, so a caller that drops records needs to change `deltas` only.
 * @param {HistoryIndex} index
 * @returns {boolean} whether the write landed
 */
function writeIndex(index) {
  const snapshots = index.snapshots.filter((seq) => index.deltas.includes(seq));
  try {
    writeStored(HISTORY_KEY, JSON.stringify({ ...index, snapshots }));
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
  const text = raw.startsWith(DELTA_PREFIX) ? raw.slice(DELTA_PREFIX.length) : raw;
  try {
    const parsed = JSON.parse(text);
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
 * function reuses the cache when the stored save mark is the cached one, or
 * when the stored string still matches the string the cache was built from.
 * Otherwise it parses the save and caches the result. An unreadable save throws, as `deserialize` does.
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
  // The mark is read before the save string. A save that lands between the
  // two reads removed that mark first, so it can never match this cache.
  const mark = readSaveMark();
  if (cached && mark !== null && cached.mark === mark) return cached.state;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) return null;
  if (cached && cached.raw === raw) {
    cached.mark = mark;
    return cached.state;
  }
  // The cached state is the one this tab holds, so every stored node that
  // encodes unchanged comes back as the node the tab already has.
  const state = deserialize(raw, storedAssetTable(), cached?.state.nodes);
  cached = { raw, state, mark };
  return state;
}

/**
 * The save string and save mark of the cached state, or null when nothing
 * is cached. At boot this is the save the page loaded. A tab that records
 * the save it last matched takes the string from here, so the tab and this
 * cache share one string, where a second `getItem` call makes a second copy
 * of the whole save.
 * @returns {{ raw: string, mark: string | null } | null}
 */
export function persistedSave() {
  return cached ? { raw: cached.raw, mark: cached.mark } : null;
}

/**
 * Make `state` the base of the next diff, stamped with the save string
 * stored now. A tab calls this after it adopts another tab's save, when its
 * live state is the stored campaign. The full load path leaves the cache on
 * freshly parsed objects, while the live state keeps the objects that
 * `Reconcile.reconcile` put back, and a delta adoption leaves the cache on
 * the save before. Either way the next save of the tab would diff two
 * states that share no object, which at 200 extra regions costs more than a
 * hundred milliseconds.
 * @param {CampaignState} state
 * @returns {{ raw: string | null, mark: string | null }} the stored save
 *   string and save mark
 */
export function adoptPersisted(state) {
  const mark = readSaveMark();
  const raw = localStorage.getItem(STORAGE_KEY);
  cached = raw === null ? null : { raw, state, mark };
  return { raw, mark };
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
 * True when a key belongs to the undo log.
 * @param {string} key
 * @returns {boolean}
 */
function isHistoryKey(key) {
  return key === HISTORY_KEY || key.startsWith(`${HISTORY_KEY}:`);
}

/**
 * Remove the oldest records until the delta records fit the byte cap and
 * the older snapshots fit the room that `HistoryBudget.js` gives them.
 * Return the surviving sequence numbers, and remove the corresponding keys.
 * Hitting the budget is by design, not a failure, so this function does not
 * report it as lost depth. An unbounded log puts the origin over quota.
 * @param {number[]} deltas
 * @param {number[]} snapshots the sequence numbers whose record is a snapshot
 * @returns {number[]}
 */
function trimToCap(deltas, snapshots) {
  const isSnapshot = new Set(snapshots);
  // The ledger already holds each record's length, so no record is read again.
  const records = deltas.map((seq) => ({
    bytes: storedLength(deltaKey(seq)) * 2,
    snapshot: isSnapshot.has(seq),
  }));
  const newest = newestSnapshot(records);
  const older = records.some((record, i) => record.snapshot && i !== newest);
  const room = older
    ? olderSnapshotRoom({
        quota: QUOTA_BYTES,
        cap: HISTORY_BYTE_CAP,
        outside: footprintWhere((key) => !isHistoryKey(key)),
        newest: records[newest].bytes,
      })
    : Infinity;
  const drop = recordsToDrop(records, HISTORY_BYTE_CAP, room);
  for (const seq of deltas.slice(0, drop)) removeStored(deltaKey(seq));
  return deltas.slice(drop);
}

/**
 * The record for the step from `before` to `after`, or null when the step
 * changes nothing. Saving an unchanged campaign again is not a history step.
 *
 * The record is the delta, with each node's ops in their smallest form
 * (`HistoryCodec.compactOps`), or a snapshot of the replaced save when the
 * snapshot is the smaller of the two. A replacing step (New, Load example,
 * Import) diffs to ops that hold both whole worlds, and the save string of
 * the old world holds one. A small edit to a large campaign keeps its
 * delta. The size check stops at the length of the save, so a replacing
 * step never builds the string of its ops.
 *
 * The diff runs over the `historyForm` of both states, so an op that adds
 * or removes an image names its `asset:` key and not its payload, and the
 * payload stays only in the image table.
 * @param {CampaignState} before
 * @param {string} beforeRaw the stored string that `before` was parsed from
 * @param {CampaignState} after
 * @returns {string | null}
 */
function stepRecord(before, beforeRaw, after) {
  const from = historyForm(before);
  const to = historyForm(after);
  const ops = diffState(from, to);
  if (!ops.length) return null;
  const compact = compactOps(ops, from, to, beforeRaw.length - DELTA_PREFIX.length);
  if (!compact) return SNAPSHOT_PREFIX + beforeRaw;
  return DELTA_PREFIX + JSON.stringify(compact.ops);
}

/**
 * True when browser storage has room for the undo snapshot of a step that
 * replaces the stored campaign with `next` (New, Load example, Import). The
 * estimate counts the new save in place of the old one, the images that
 * `next` adds to the localStorage image table (none when IndexedDB keeps
 * the images, per `AssetMirror.js`), every other key outside the log, and the
 * snapshot. Every other record of the log can drop to make room, so they do
 * not count. With nothing stored, the step records no snapshot and loses
 * nothing. The estimate uses `QUOTA_BYTES`, and a browser that allows more
 * can still take a snapshot that this function reports as too large.
 * @param {CampaignState} next
 * @returns {boolean}
 */
export function replaceIsUndoable(next) {
  const stored = storedLength(STORAGE_KEY);
  if (!stored) return true;
  // The pack caches keep this work for the real save that follows.
  const { state, assets } = detachAssets(packState(next));
  const saveLength = JSON.stringify(state).length;
  const entries = mirrorActive() ? [] : Object.entries(assets);
  const table = entries.length ? storedAssetTable() : {};
  let added = 0;
  for (const [key, payload] of entries) {
    // A key and a payload cost their length plus quotes, a colon, and a comma.
    if (table[key] !== payload) added += key.length + payload.length + 4;
  }
  const outside = footprintWhere((key) => !isHistoryKey(key)) + (saveLength - stored + added) * 2;
  const record = deltaKey(nextSeq(readIndex())).length + SNAPSHOT_PREFIX.length + stored;
  return snapshotFits({ quota: QUOTA_BYTES, outside, snapshot: record * 2 });
}

/**
 * A state with a recorded delta applied: the ops of `planAdoption`, or of
 * a stored record inverted with `invertOps`. The compact node ops become
 * plain ops first. An op that names an `asset:` key leaves that key in the
 * state, so the state then goes through `restoreAssets` with the stored
 * image table, the same step a load runs. The table is read only for such
 * an op. `restoreAssets` returns every node and handout that it does not
 * change as the same object.
 * @template {object} T
 * @param {T} state
 * @param {DiffOp[]} ops
 * @returns {T}
 */
export function applyHistoryOps(state, ops) {
  const next = applyOps(state, expandOps(ops));
  if (!opsNameAssets(ops)) return next;
  return /** @type {T} */ (restoreAssets({ ...next, assets: storedAssetTable() }));
}

/**
 * Append one record and remove any redo tail that the new edit
 * invalidates. `ok` states whether this step is undoable, and `evictedAll`
 * states whether a full origin cost the GM depth beyond the ordinary cap.
 * A record larger than the whole cap stays as the only step, because
 * `trimToCap` always keeps the newest record.
 *
 * A step that starts a new log stores `baseMark` in the index. A follower
 * that loaded the save before the log began has no position, and the mark
 * tells `planAdoption` that it holds the state the first record applies to.
 * @param {string} record
 * @param {string | null} baseMark the save mark of the save this step diffed
 *   against, or null when it is not known
 * @returns {HistoryResult}
 */
function recordStep(record, baseMark) {
  const index = readIndex();
  const seq = nextSeq(index);
  let tail = index.deltas.slice(index.cursor);
  const deltas = [...index.deltas.slice(0, index.cursor), seq];
  const snapshots = record.startsWith(SNAPSHOT_PREFIX)
    ? [...index.snapshots, seq]
    : index.snapshots;
  let evictedAll = false;
  for (;;) {
    try {
      writeStored(deltaKey(seq), record);
      break;
    } catch {
      // A full origin degrades depth first. The redo tail goes before any
      // step, because this step drops it anyway, and an undone Import leaves
      // a whole save in it. Then the oldest step goes, and the write runs
      // again, instead of losing the whole log for one write.
      if (tail.length) {
        for (const dropped of tail) removeStored(deltaKey(dropped));
        tail = [];
        continue;
      }
      if (deltas.length < 2) {
        clearHistoryLog();
        return { ok: false, evictedAll: true };
      }
      const oldest = /** @type {number} */ (deltas.shift());
      removeStored(deltaKey(oldest));
      evictedAll = true;
    }
  }
  const kept = trimToCap(deltas, snapshots);
  const log = index.log || newLogId();
  // The index write happens last. An index that names a key that was never
  // written describes a history step that cannot be applied. An unnamed key
  // is only unused data.
  const next = {
    version: CURRENT_VERSION,
    log,
    deltas: kept,
    cursor: kept.length,
    snapshots,
    baseMark: index.log ? index.baseMark : baseMark,
  };
  if (!writeIndex(next)) {
    clearHistoryLog();
    return { ok: false, evictedAll: true };
  }
  for (const dropped of tail) removeStored(deltaKey(dropped));
  return { ok: true, evictedAll };
}

/**
 * Remove history to make room for a campaign write that failed on a full
 * origin. Each call removes the next piece and returns true, or returns
 * false when no history is left. The redo tail goes first, because the save
 * that needs the room drops it anyway. Then the oldest step goes, one per
 * call, and last any history key that the index does not name.
 *
 * The index is written before the records are removed, so it never names a
 * key that is gone. An index write that fails clears the whole log.
 * @returns {boolean}
 */
function dropForSave() {
  const index = readIndex();
  const tail = index.deltas.slice(index.cursor);
  const doomed = tail.length ? tail : index.deltas.slice(0, 1);
  if (!doomed.length) return clearHistoryLog();
  const deltas = index.deltas.filter((seq) => !doomed.includes(seq));
  const cursor = tail.length ? index.cursor : index.cursor - 1;
  if (!deltas.length || !writeIndex({ ...index, deltas, cursor })) {
    clearHistoryLog();
    return true;
  }
  for (const seq of doomed) removeStored(deltaKey(seq));
  return true;
}

/**
 * Persist a campaign and record the step that produced it. This is the only
 * save path. This module writes the record after the campaign, so a failed
 * campaign write leaves the log describing exactly what is stored. A
 * snapshot record references the images of the replaced save, and a delta
 * record can name an image that the new save no longer has, so the save
 * keeps those images in the payload table.
 *
 * A campaign write that fails on a full origin removes history and tries
 * again (`dropForSave`), and `history.evictedAll` reports the lost depth.
 * The record of this step stays valid, because it describes the stored
 * save, and no removed step does. When the write fails with no history
 * left, `history.ok` is false.
 *
 * Nothing is recorded when nothing readable is stored to diff against: a
 * first save, or a stored save that this app cannot read. Either way, the
 * campaign is now the oldest state there is.
 *
 * `mark` is the save mark written after the save, or null when the save or
 * the mark write failed. A tab keeps it to tell a later write from another
 * tab apart without reading the save string.
 *
 * A result with `pending` wrote and recorded nothing, because the save
 * adds an image whose IndexedDB put has not committed. The caller saves
 * again once the promise settles.
 * @param {CampaignState} state
 * @returns {ReturnType<typeof trySaveToLocalStorage> & { history: HistoryResult, mark: string | null }}
 */
export function saveCampaign(state) {
  const before = lastPersisted();
  // `lastPersisted` leaves the cache on the string it parsed.
  const record = before && cached ? stepRecord(before, cached.raw, state) : null;
  // A second read of the mark proves that the cached string is the save
  // that this mark was written with. A save from another tab that landed
  // between the reads of `lastPersisted` changed the mark.
  const baseMark = cached?.mark != null && readSaveMark() === cached.mark ? cached.mark : null;
  // A record that names an image keeps it in the table. The retention scan
  // of this save runs before the record is written, so it waits for the next
  // save, which finds the record.
  const keepPrevious =
    record !== null && (record.startsWith(SNAPSHOT_PREFIX) || record.includes(ASSET_PREFIX));
  let dropped = false;
  const makeRoom = () => {
    const freed = dropForSave();
    dropped ||= freed;
    return freed;
  };
  const save = writeCampaign(state, { keepPrevious, makeRoom });
  if (!save.ok) return { ...save, history: { ok: !dropped, evictedAll: dropped }, mark: null };
  const history = record ? recordStep(record, baseMark) : { ok: true, evictedAll: false };
  const mark = markSave();
  return { ...save, history: dropped ? { ...history, evictedAll: true } : history, mark };
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
    restored = applyHistoryOps(current, direction < 0 ? invertOps(ops) : ops);
  } catch {
    clearHistoryLog();
    return null;
  }
  const save = writeCampaign(restored);
  if (!save.ok) return { save, state: restored };
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
    restored = deserialize(snapshot, storedAssetTable());
  } catch {
    clearHistoryLog();
    return null;
  }
  // The new record references the images of the save this write replaces.
  const save = writeCampaign(restored, { keepPrevious: true });
  if (!save.ok) return { save, state: restored };
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
  if (!writeIndex({ ...index, ...next, snapshots: [...index.snapshots, seq] })) {
    clearHistoryLog();
    return { save, state: restored };
  }
  for (const old of index.deltas) if (!next.deltas.includes(old)) removeStored(deltaKey(old));
  return { save, state: restored };
}

/**
 * The position at `at` in this log, as an opaque token, or null when the log
 * is empty. The token pairs the log id with the sequence number of the
 * record before the position, or with `^` and the first record's number at
 * position 0. A cleared and restarted log reuses sequence numbers but never
 * the id, so a token from the old log matches nothing. A record dropped from
 * the front changes the token of position 0, because the old base state is
 * no longer reachable.
 * @param {HistoryIndex} index
 * @param {number} at a cursor value: how many deltas the position reflects
 * @returns {string | null}
 */
function positionToken(index, at) {
  if (at > 0) return `${index.log}:${index.deltas[at - 1]}`;
  return index.deltas.length ? `${index.log}:^${index.deltas[0]}` : null;
}

/**
 * The cursor value of the state a tab holds, or -1 when the log does not
 * name it. A tab with no position loaded its save before the log began.
 * When its save mark is the log's `baseMark` and the first record is still
 * sequence number 0, it holds the state that record applies to.
 * @param {HistoryIndex} index
 * @param {string | null} held
 * @param {string | null} heldMark
 * @returns {number}
 */
function heldAt(index, held, heldMark) {
  if (held === null) {
    return heldMark !== null && heldMark === index.baseMark && index.deltas[0] === 0 ? 0 : -1;
  }
  for (let at = 0; at <= index.deltas.length; at += 1) {
    if (positionToken(index, at) === held) return at;
  }
  return -1;
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
 * `delta` comes back when the log walks from the held position to the
 * cursor in at most `ADOPTION_WALK` delta records. Each entry of `steps` is
 * the ops of one record, in walk order. A walk forward covers saves and
 * redos, and a walk back covers undos, with each record's ops inverted. A
 * save made from an undone cursor drops the redo tail and appends, so a tab
 * that holds a position before the cursor walks forward. Apply the steps one
 * at a time, because `applyOps` groups the ops of one list by kind and does
 * not apply them in list order.
 *
 * `current` means the persisted save is the state the tab already holds.
 *
 * Everything else is `full`: a position that the log does not name, a walk
 * longer than `ADOPTION_WALK`, a snapshot record or an unreadable record in
 * the walk, or an empty or cleared log. The caller then re-reads the whole
 * save.
 * @param {string | null} held
 * @param {string | null} [heldMark] the save mark of the save the tab holds
 * @returns {{ kind: 'current' | 'full' } | { kind: 'delta', steps: DiffOp[][] }}
 */
export function planAdoption(held, heldMark = null) {
  const index = readIndex();
  const from = heldAt(index, held, heldMark);
  if (from < 0) return { kind: 'full' };
  const { cursor } = index;
  if (from === cursor) return { kind: 'current' };
  if (Math.abs(cursor - from) > ADOPTION_WALK) return { kind: 'full' };
  const forward = cursor > from;
  /** @type {DiffOp[][]} */
  const steps = [];
  for (let at = from; at !== cursor; at += forward ? 1 : -1) {
    const ops = readDelta(index.deltas[forward ? at : at - 1]);
    if (!ops) return { kind: 'full' };
    steps.push(forward ? ops : invertOps(ops));
  }
  return { kind: 'delta', steps };
}

/**
 * Write the save mark after a step that stored a campaign, so a follower
 * tab adopts it with the index this step wrote.
 * @param {StepResult | null} result
 * @returns {StepResult | null}
 */
function marked(result) {
  if (result?.save.ok) markSave();
  return result;
}

/**
 * Restore the state before the most recent recorded edit, and persist it.
 * This function returns null when there is nothing to undo.
 * @returns {{ save: ReturnType<typeof trySaveToLocalStorage>, state: CampaignState } | null}
 */
export function undoCampaign() {
  return marked(step(-1));
}

/**
 * Reapply the edit that the last undo reversed, and persist the result. This
 * function returns null when the cursor is already at the head.
 * @returns {{ save: ReturnType<typeof trySaveToLocalStorage>, state: CampaignState } | null}
 */
export function redoCampaign() {
  return marked(step(1));
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
