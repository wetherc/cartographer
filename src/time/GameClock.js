/** @typedef {import('../types/time.js').GameClock} GameClock */

/**
 * The named watches that divide one in-game day, in order. A day advances
 * one watch at a time. Rolling past the last watch increases the day by one.
 * @type {string[]}
 */
export const WATCHES = ['Dawn', 'Morning', 'Midday', 'Afternoon', 'Dusk', 'Night'];

/** @returns {GameClock} A fresh clock at the dawn of day 1. */
export function createClock() {
  return { day: 1, watch: 0 };
}

/**
 * Advance the clock by `watches` watches, rolling the day over as needed.
 * The function treats negative values as zero. The clock never runs
 * backward.
 * @param {GameClock} clock
 * @param {number} [watches]
 * @returns {GameClock}
 */
export function advanceWatches(clock, watches = 1) {
  const total = clock.watch + Math.max(0, Math.floor(watches));
  return { day: clock.day + Math.floor(total / WATCHES.length), watch: total % WATCHES.length };
}

/**
 * Advance to the next Dawn: the start of the next day if the clock is
 * already past dawn. A long rest calls this function. If the clock is
 * exactly at Dawn already, the function still advances a full day, so a
 * long rest always takes time.
 * @param {GameClock} clock
 * @returns {GameClock}
 */
export function advanceToDawn(clock) {
  return { day: clock.day + 1, watch: 0 };
}

/**
 * @param {GameClock} clock
 * @returns {string} For example "Day 3, Dusk".
 */
export function formatClock(clock) {
  return `Day ${clock.day}, ${WATCHES[clock.watch] ?? WATCHES[0]}`;
}
