/**
 * The stored records of the undo log: the index under `HISTORY_KEY`, and one
 * record per step under `HISTORY_KEY:d<seq>`. A record is either a delta (a
 * list of ops) or a snapshot (a whole save string). `HistoryLog.js` decides
 * what to write, and this module reads and writes the keys. Every reader
 * here returns an empty or null result for unreadable data, and the index
 * reader clears the whole log in that case.
 */

import { CURRENT_VERSION } from './Migrations.js';
import { clamp } from '../util/num.js';
import { isRecord } from '../util/isRecord.js';
import { removeStored, writeStored } from './Footprint.js';

/** @typedef {import('../types/storage.js').DiffOp} DiffOp */
/** @typedef {{ version: number, log: string, deltas: number[], cursor: number, snapshots: number[], baseMark: string | null }} HistoryIndex */
/** @typedef {{ ops: DiffOp[] } | { snapshot: string }} HistoryRecord */

/**
 * The prefix of a snapshot record. The rest of the record is a stored save
 * string.
 */
export const SNAPSHOT_PREFIX = 'snapshot:';

/**
 * The prefix of a delta record. The rest of the record is a JSON list of
 * ops, which can hold the compact node ops of `HistoryCodec.js`. A tab that
 * still runs an app version without those ops reads a record with this
 * prefix as unreadable and takes its full load path. Read as a plain list,
 * a `node` op inserts an encoded node into the live state, and that tab's
 * next save writes the node with most of its tiles gone. A record that is
 * a bare JSON list holds plain ops only, and it still applies.
 */
export const DELTA_PREFIX = 'delta:';

/** The localStorage key that holds the history index. */
export const HISTORY_KEY = 'campaign-builder:history';

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
 * A random id for a fresh log. Sequence numbers restart at zero after
 * `clearHistoryLog`, so a bare sequence number can name two different states
 * across log generations. Every position this module hands out carries the
 * log id beside the number, and a position from a cleared log then matches
 * nothing in the log that replaced it. Collision odds are irrelevant here:
 * a wrong match costs a follower one delta applied to the wrong base, and
 * two ids colliding needs the same random draw in the same origin.
 * @returns {string}
 */
export function newLogId() {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * @param {number} seq
 * @returns {string}
 */
export function deltaKey(seq) {
  return `${HISTORY_KEY}:d${seq}`;
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
export function readIndex() {
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
export function writeIndex(index) {
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
export function readRecord(seq) {
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
export function readDelta(seq) {
  const record = readRecord(seq);
  return record && 'ops' in record ? record.ops : null;
}

/**
 * The sequence number for the next record of this log.
 * @param {HistoryIndex} index
 * @returns {number}
 */
export function nextSeq(index) {
  return Math.max(-1, ...index.deltas) + 1;
}

/**
 * True when a key belongs to the undo log.
 * @param {string} key
 * @returns {boolean}
 */
export function isHistoryKey(key) {
  return key === HISTORY_KEY || key.startsWith(`${HISTORY_KEY}:`);
}
