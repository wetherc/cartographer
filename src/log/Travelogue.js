/**
 * Pure helpers for the party's travelogue: an append-only, capped list of
 * events (party movement, combat outcomes) recorded as the campaign is played.
 * Message composition and id generation live in the caller (main.js), so this
 * module stays free of app state and is unit-testable.
 */

/** @typedef {import('../types/log.js').LogEntry} LogEntry */
/** @typedef {import('../types/log.js').LogEntryKind} LogEntryKind */

/** How many entries a travelogue retains before the oldest are dropped. */
export const TRAVELOG_LIMIT = 200;

/**
 * @param {string} id
 * @param {LogEntryKind} kind
 * @param {string} message
 * @param {number} at epoch milliseconds
 * @returns {LogEntry}
 */
export function createEntry(id, kind, message, at) {
  return { id, kind, message, at };
}

/**
 * Append an entry, returning a new list. Entries are stored oldest-first; once
 * the list exceeds `limit`, the oldest are trimmed so it never grows unbounded.
 * @param {LogEntry[]} log
 * @param {LogEntry} entry
 * @param {number} [limit]
 * @returns {LogEntry[]}
 */
export function appendEntry(log, entry, limit = TRAVELOG_LIMIT) {
  const next = [...log, entry];
  return next.length > limit ? next.slice(next.length - limit) : next;
}
