/**
 * The travelogue as each viewer role reads it. A GM-only entry (`gm: true`)
 * names something that the Player view hides elsewhere, such as the exact
 * HP of a foe. The GM reads every entry as logged. A Player tab reads the
 * entry's `player` line in its place, or does not see the entry when it has
 * no player line. The ids stay the same, so the append-only panels find
 * their place in either list.
 */

import { isGM } from '../view/ViewRole.js';

/** @typedef {import('../types/log.js').LogEntry} LogEntry */
/** @typedef {import('../types/log.js').LogOptions} LogOptions */
/** @typedef {import('../types/view.js').ViewRole} ViewRole */

/**
 * The visibility fields of a new entry. A player line marks the entry
 * GM-only, because a player line exists only to stand in for a GM line. An
 * empty player line counts as none.
 * @param {LogOptions} [options]
 * @returns {{ gm?: true, player?: string }}
 */
export function visibilityFields(options = {}) {
  const player = options.player ? { player: options.player } : {};
  return options.gm || options.player ? { gm: true, ...player } : {};
}

/**
 * The entry as a Player tab reads it, or null when a Player tab does not
 * see it.
 * @param {LogEntry} entry
 * @returns {LogEntry | null}
 */
export function playerEntry(entry) {
  if (!entry.gm) return entry;
  if (!entry.player) return null;
  const { gm: _gm, player, ...rest } = entry;
  return { ...rest, message: player };
}

/** The Player-tab list of each travelogue list, keyed on the source list. The
 * travelogue is never changed in place, so a list maps to one result. */
const playerLists = /** @type {WeakMap<LogEntry[], LogEntry[]>} */ (new WeakMap());

/**
 * The entries that a viewer role reads. The GM gets the list itself. A
 * Player tab gets a new list, which the function keeps for the next call
 * with the same source list, so a panel that refreshes with no new entry
 * does not map the whole log again.
 * @param {LogEntry[]} log
 * @param {ViewRole} role
 * @returns {LogEntry[]}
 */
export function entriesFor(log, role) {
  if (isGM(role)) return log;
  const known = playerLists.get(log);
  if (known) return known;
  const seen = log.flatMap((entry) => {
    const shown = playerEntry(entry);
    return shown ? [shown] : [];
  });
  playerLists.set(log, seen);
  return seen;
}
