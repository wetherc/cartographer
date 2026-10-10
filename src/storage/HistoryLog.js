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
import { STORAGE_KEY, deserialize, packState, readSaveMark } from './SaveManager.js';
import { lastPersisted, markSave, persistedSave, writeCampaign } from './PersistedCampaign.js';
import { detachAssets } from './AssetStore.js';
import { mirrorActive, storedAssetTable } from './AssetMirror.js';
import {
  QUOTA_BYTES,
  footprintWhere,
  removeStored,
  storedLength,
  writeStored,
} from './Footprint.js';
import { snapshotFits } from './HistoryBudget.js';
import { dropForSave, recordStep } from './HistoryAppend.js';
import {
  DELTA_PREFIX,
  SNAPSHOT_PREFIX,
  clearHistoryLog,
  deltaKey,
  isHistoryKey,
  nextSeq,
  readIndex,
  readRecord,
  writeIndex,
} from './HistoryRecords.js';

// Callers outside the undo log name the index key and clear the log through
// this module.
export { HISTORY_KEY, clearHistoryLog } from './HistoryRecords.js';

/** @typedef {import('../types/storage.js').CampaignState} CampaignState */
/** @typedef {import('../types/storage.js').DiffOp} DiffOp */
/** @typedef {import('./HistoryRecords.js').HistoryIndex} HistoryIndex */
/** @typedef {import('./HistoryAppend.js').HistoryResult} HistoryResult */
/** @typedef {import('./HistoryRecords.js').HistoryRecord} HistoryRecord */

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
 * campaign is now the oldest state there is. A write over an unreadable save
 * also clears the log, because its deltas record steps from that save and
 * would apply to the new campaign on the next Undo.
 *
 * `mark` is the save mark written after the save, or null when the save or
 * the mark write failed. A tab keeps it to tell a later write from another
 * tab apart without reading the save string.
 *
 * A result with `pending` wrote and recorded nothing, because the save
 * adds an image whose IndexedDB put has not committed. The caller saves
 * again once the promise settles.
 * @param {CampaignState} state
 * @returns {ReturnType<typeof import('./SaveManager.js').trySaveToLocalStorage> & { history: HistoryResult, mark: string | null }}
 */
export function saveCampaign(state) {
  const before = lastPersisted();
  // A stored string that `lastPersisted` cannot read is an unreadable save.
  // The deltas in the log describe steps from it, and after this write they
  // would apply to a campaign they were never recorded against.
  const unreadable = before === null && localStorage.getItem(STORAGE_KEY) !== null;
  // `lastPersisted` leaves the cache on the string it parsed.
  const held = persistedSave();
  const record = before && held ? stepRecord(before, held.raw, state) : null;
  // A second read of the mark proves that the cached string is the save
  // that this mark was written with. A save from another tab that landed
  // between the reads of `lastPersisted` changed the mark.
  const baseMark = held?.mark != null && readSaveMark() === held.mark ? held.mark : null;
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
  if (unreadable) clearHistoryLog();
  const history = record ? recordStep(record, baseMark) : { ok: true, evictedAll: false };
  const mark = markSave();
  return { ...save, history: dropped ? { ...history, evictedAll: true } : history, mark };
}

/** @typedef {{ save: ReturnType<typeof import('./SaveManager.js').trySaveToLocalStorage>, state: CampaignState }} StepResult */

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
 * @returns {{ save: ReturnType<typeof import('./SaveManager.js').trySaveToLocalStorage>, state: CampaignState } | null}
 */
export function undoCampaign() {
  return marked(step(-1));
}

/**
 * Reapply the edit that the last undo reversed, and persist the result. This
 * function returns null when the cursor is already at the head.
 * @returns {{ save: ReturnType<typeof import('./SaveManager.js').trySaveToLocalStorage>, state: CampaignState } | null}
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

/**
 * Whether Undo can restore a stored save that this app cannot read. Only a
 * snapshot step can, because `swapSnapshot` reads the stored save as a
 * string. A delta step applies its ops to the parsed save, and with no
 * parsed save `applyDelta` returns null.
 * @returns {boolean}
 */
export function undoRestoresSave() {
  const index = readIndex();
  if (index.cursor < 1) return false;
  const seq = index.deltas[index.cursor - 1];
  return (
    index.snapshots.includes(seq) &&
    (localStorage.getItem(deltaKey(seq))?.startsWith(SNAPSHOT_PREFIX) ?? false)
  );
}
