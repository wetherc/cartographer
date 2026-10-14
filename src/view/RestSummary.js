import { HP_RESOURCE_ID } from '../entities/PoolIds.js';

/** @typedef {import('../types/entities.js').Character} Character */

/**
 * The names of the pools that a rest refilled, across the whole party. A pool
 * counts when its `current` rose from the copy before the rest to the copy
 * after it. HP is left out, because healing has its own log lines. Each name
 * appears once, in party order, so two fighters give one "Second Wind".
 * @param {Character[]} before
 * @param {Character[]} after the same characters, in the same order
 * @returns {string[]}
 */
export function restoredPoolNames(before, after) {
  /** @type {Set<string>} */
  const names = new Set();
  after.forEach((character, index) => {
    const old = new Map((before[index]?.resources ?? []).map((r) => [r.id, r.current]));
    for (const pool of character.resources) {
      if (pool.id === HP_RESOURCE_ID) continue;
      if (pool.current > (old.get(pool.id) ?? pool.current)) names.add(pool.name);
    }
  });
  return [...names];
}

/**
 * Join names into one phrase: "A", "A and B", "A, B, and C".
 * @param {string[]} names
 * @returns {string}
 */
function joinNames(names) {
  if (names.length <= 2) return names.join(' and ');
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

/**
 * The toast after a short rest. A rest with no dialog (nobody hurt) and no
 * pool to refill still takes an hour, so the toast says so, and a click on
 * Short rest never passes with no sign.
 * @param {string[]} restored pool names from `restoredPoolNames`
 * @param {string} now the clock after the rest, from `formatClock`
 * @returns {string}
 */
export function shortRestToast(restored, now) {
  const pools = restored.length > 0 ? `${joinNames(restored)} restored.` : 'Nothing to restore.';
  return `Short rest: 1 hour. ${pools} Now ${now}.`;
}
