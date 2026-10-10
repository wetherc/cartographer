/**
 * Cross-tab adoption through the undo log. A tab records the log position
 * that its live state matches, and when another tab saves, this module plans
 * how the tab reaches the new save: by walking a few delta records, or by
 * re-reading the whole save. `HistoryLog.js` writes the records that this
 * module reads.
 */

import { invertOps } from './StateDiff.js';
import { readDelta, readIndex } from './HistoryRecords.js';

/** @typedef {import('../types/storage.js').DiffOp} DiffOp */
/** @typedef {import('./HistoryRecords.js').HistoryIndex} HistoryIndex */

/**
 * The most records that `planAdoption` walks. Each record costs the follower
 * one `applyOps` pass, so a long walk costs more than the full read it
 * replaces.
 */
export const ADOPTION_WALK = 8;

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
