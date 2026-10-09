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

/** @typedef {import('../types/log.js').LogBudget} LogBudget */

/**
 * How many entries of each budget a travelogue keeps before it removes the
 * oldest of that budget. Story entries (travel, notes, and rests) have their
 * own budget, so a long fight or a busy dice tray cannot push the story of
 * the campaign out of the log.
 * @type {Readonly<Record<LogBudget, number>>}
 */
export const TRAVELOG_LIMITS = Object.freeze({ story: 200, chatter: 200 });

/**
 * The most chatter entries a travelogue keeps while a fight runs. The lines
 * of the running fight stay past the chatter limit, so the combat log column
 * can show the fight from its first initiative roll. This cap bounds a fight
 * that the GM never ends.
 */
export const TRAVELOG_FIGHT_LIMIT = 1000;

/**
 * The budget that an entry kind counts against. Rolls and fight lines are
 * chatter, and every other kind is story.
 * @param {LogEntryKind} kind
 * @returns {LogBudget}
 */
export function logBudget(kind) {
  return kind === 'roll' || kind === 'combat' ? 'chatter' : 'story';
}

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
 * Each budget of `limits` counts its own entries (see `logBudget`). Once a
 * budget has more entries than its limit, the function removes the oldest
 * entries of that budget, so the list never grows without bound and a flood
 * of rolls never removes a travel line.
 *
 * `keepSince` is the `startedAt` of a running fight. The chatter trim then
 * removes only chatter older than it, so a long fight does not push its own
 * first lines out of the combat log column. The chatter can grow past its
 * limit while the fight runs, up to `TRAVELOG_FIGHT_LIMIT`, and the first
 * append after the fight ends trims it back.
 * @param {LogEntry[]} log
 * @param {LogEntry} entry
 * @param {Readonly<Record<LogBudget, number>>} [limits]
 * @param {number | null} [keepSince]
 * @returns {LogEntry[]}
 */
export function appendEntry(log, entry, limits = TRAVELOG_LIMITS, keepSince = null) {
  const next = [...log, entry];
  /** @type {Record<LogBudget, number[]>} the list indexes of each budget, oldest first */
  const members = { story: [], chatter: [] };
  next.forEach((e, i) => members[logBudget(e.kind)].push(i));
  const dropped = new Set();
  for (const budget of /** @type {LogBudget[]} */ (['story', 'chatter'])) {
    const indexes = members[budget];
    let cut = indexes.length - limits[budget];
    if (cut <= 0) continue;
    if (keepSince !== null && budget === 'chatter') {
      const found = indexes.findIndex((i) => next[i].at >= keepSince);
      const fightStart = found === -1 ? indexes.length : found;
      cut = Math.max(Math.min(cut, fightStart), indexes.length - TRAVELOG_FIGHT_LIMIT);
    }
    for (const i of indexes.slice(0, cut)) dropped.add(i);
  }
  return dropped.size === 0 ? next : next.filter((_, i) => !dropped.has(i));
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
