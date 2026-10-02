/**
 * Pure helpers for the party's travelogue. This is an append-only, capped
 * list of events (party movement, combat outcomes) recorded as the campaign
 * runs. Message composition and id generation live in the caller (main.js),
 * so this module stays free of app state and tests can run against it
 * directly.
 */

import { visibilityFields } from './LogVisibility.js';
import { formatClock } from '../time/GameClock.js';

/** @typedef {import('../types/log.js').LogEntry} LogEntry */
/** @typedef {import('../types/log.js').LogEntryKind} LogEntryKind */

/** How many entries a travelogue keeps before it removes the oldest. */
export const TRAVELOG_LIMIT = 200;

/**
 * The most entries a travelogue keeps while a fight runs. The entries of the
 * running fight stay past `TRAVELOG_LIMIT`, so the combat log column can
 * show the fight from its first initiative roll. This cap bounds a fight
 * that the GM never ends.
 */
export const TRAVELOG_FIGHT_LIMIT = 1000;

/**
 * @param {string} id
 * @param {LogEntryKind} kind
 * @param {string} message
 * @param {number} at Epoch milliseconds.
 * @param {import('../types/log.js').LogOptions} [options] who may read the line (see
 *   `LogVisibility.visibilityFields`)
 * @param {import('../types/log.js').LogStamp} [stamp] the in-game day and watch, and
 *   the combat round during a fight
 * @returns {LogEntry}
 */
export function createEntry(id, kind, message, at, options, stamp = {}) {
  const clock = stamp.clock ? { clock: { day: stamp.clock.day, watch: stamp.clock.watch } } : {};
  const round = stamp.round ? { round: stamp.round } : {};
  return { id, kind, message, at, ...visibilityFields(options), ...clock, ...round };
}

/**
 * The in-game time of an entry, or null for an entry with no clock. The
 * combat log passes `withRound`, so a line from a fight reads "Round 2". The
 * travelogue reads the day and watch, with the round added for a fight line.
 * @param {LogEntry} entry
 * @param {boolean} [withRound] show only the round when the entry has one
 * @returns {string | null}
 */
export function stampLabel(entry, withRound = false) {
  const round = entry.round ? `Round ${entry.round}` : null;
  if (withRound && round) return round;
  if (!entry.clock) return round;
  const clock = formatClock(entry.clock);
  return round ? `${clock}, ${round.toLowerCase()}` : clock;
}

/**
 * Append an entry, and return a new list. Entries are stored oldest first.
 * Once the list exceeds `limit`, the function trims the oldest entries, so
 * the list never grows without bound.
 *
 * `keepSince` is the `startedAt` of a running fight. The trim then removes
 * only entries older than it, so a long fight does not push its own first
 * lines out of the combat log column. The list can grow past `limit` while
 * the fight runs, up to `TRAVELOG_FIGHT_LIMIT`, and the first append after
 * the fight ends trims it back.
 * @param {LogEntry[]} log
 * @param {LogEntry} entry
 * @param {number} [limit]
 * @param {number | null} [keepSince]
 * @returns {LogEntry[]}
 */
export function appendEntry(log, entry, limit = TRAVELOG_LIMIT, keepSince = null) {
  const next = [...log, entry];
  if (next.length <= limit) return next;
  let cut = next.length - limit;
  if (keepSince !== null) {
    const found = next.findIndex((e) => e.at >= keepSince);
    const fightStart = found === -1 ? next.length : found;
    cut = Math.max(Math.min(cut, fightStart), next.length - TRAVELOG_FIGHT_LIMIT);
  }
  return next.slice(cut);
}

/**
 * The entries newer than `lastId`, for append-only rendering. This function
 * returns the whole log when `lastId` is null (nothing shown yet), or null
 * when `lastId` is no longer in the log (the log was cleared or replaced),
 * so the caller knows to redraw from scratch. The search runs newest first,
 * since `lastId` is normally at or near the end.
 * @param {LogEntry[]} log
 * @param {string | null} lastId
 * @returns {LogEntry[] | null}
 */
export function entriesAfter(log, lastId) {
  if (lastId === null) return log;
  for (let i = log.length - 1; i >= 0; i--) {
    if (log[i].id === lastId) return log.slice(i + 1);
  }
  return null;
}

/**
 * An entry's timestamp as the ISO string a `<time>` element's `dateTime`
 * takes, or null when the value is not a date. `toISOString` throws on an
 * invalid date, and the panels format every entry during composition, so
 * one unreadable timestamp in a loaded save used to stop the app from
 * starting.
 * @param {number} at Epoch milliseconds.
 * @returns {string | null}
 */
export function isoTimestamp(at) {
  const date = new Date(at);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
