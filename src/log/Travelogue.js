/**
 * Pure helpers for the party's travelogue. This is an append-only, capped
 * list of events (party movement, combat outcomes) recorded as the campaign
 * runs. Message composition and id generation live in the caller (main.js),
 * so this module stays free of app state and tests can run against it
 * directly.
 */

/** @typedef {import('../types/log.js').LogEntry} LogEntry */
/** @typedef {import('../types/log.js').LogEntryKind} LogEntryKind */

/** How many entries a travelogue keeps before it removes the oldest. */
export const TRAVELOG_LIMIT = 200;

/**
 * @param {string} id
 * @param {LogEntryKind} kind
 * @param {string} message
 * @param {number} at Epoch milliseconds.
 * @returns {LogEntry}
 */
export function createEntry(id, kind, message, at) {
  return { id, kind, message, at };
}

/**
 * Append an entry, and return a new list. Entries are stored oldest first.
 * Once the list exceeds `limit`, the function trims the oldest entries, so
 * the list never grows without bound.
 * @param {LogEntry[]} log
 * @param {LogEntry} entry
 * @param {number} [limit]
 * @returns {LogEntry[]}
 */
export function appendEntry(log, entry, limit = TRAVELOG_LIMIT) {
  const next = [...log, entry];
  return next.length > limit ? next.slice(next.length - limit) : next;
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
