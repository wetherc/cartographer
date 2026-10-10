/**
 * The write side of the undo log: append the record of one save, trim the
 * log to its byte budgets, and drop history when a campaign write needs the
 * room. `HistoryLog.js` decides what each record is and when to write it.
 */

import { CURRENT_VERSION } from './Migrations.js';
import {
  QUOTA_BYTES,
  footprintWhere,
  removeStored,
  storedLength,
  writeStored,
} from './Footprint.js';
import { newestSnapshot, olderSnapshotRoom, recordsToDrop } from './HistoryBudget.js';
import {
  SNAPSHOT_PREFIX,
  clearHistoryLog,
  deltaKey,
  isHistoryKey,
  newLogId,
  nextSeq,
  readIndex,
  writeIndex,
} from './HistoryRecords.js';

/** @typedef {{ ok: boolean, evictedAll: boolean }} HistoryResult */

/**
 * How many bytes of delta records this module keeps. Without a cap, a log
 * of large edits (a region generated or regenerated, a custom tile painted
 * over a whole node) grows until the origin is over quota. Snapshot records
 * do not count here. They have their own budget in `HistoryBudget.js`.
 */
export const HISTORY_BYTE_CAP = 512 * 1024;

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
export function recordStep(record, baseMark) {
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
export function dropForSave() {
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
