import { advanceMinutes, crossesInto, formatMinutes, minutesUntil } from './GameClock.js';
import { stepsBefore } from './TravelTime.js';

/** @typedef {import('../types/time.js').GameClock} GameClock */

/**
 * What the GM reads before a walk that runs into Night. `night` is the day
 * that Night falls on, so a "Don't ask again tonight" choice covers every
 * walk into that one Night. `stop` is the walk cut at its last step before
 * Night, or null when that cut has no steps or the move has no walk.
 * @typedef {{ night: number, message: string, stop: string[] | null }} NightWarning
 */

/**
 * The Night warning for a walk, or null when the walk ends before Night.
 * @param {GameClock} clock the time when the walk starts
 * @param {number} perStep minutes one step costs on this map
 * @param {number} steps the steps the walk charges
 * @param {readonly string[] | null} path the tiles of the walk, or null for
 *   a forced move that follows no path
 * @returns {NightWarning | null}
 */
export function nightWarning(clock, perStep, steps, path) {
  const minutes = perStep * steps;
  if (minutes <= 0 || !crossesInto(clock, minutes, 'Night')) return null;
  const until = minutesUntil(clock, 'Night');
  const keep = path ? stepsBefore(until, perStep, steps) : 0;
  return {
    night: advanceMinutes(clock, until).day,
    message: `The walk takes ${formatMinutes(minutes)}, and Night falls on the way.`,
    stop: keep > 0 && path ? path.slice(0, keep + 1) : null,
  };
}
