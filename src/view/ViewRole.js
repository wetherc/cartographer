/**
 * The viewer-role split. The same campaign draws differently for the GM
 * (full truth: exact HP, authored notes, every handout) and for players (a
 * coarse HP band, no secret notes, only revealed handouts). This module
 * owns the pure pieces of that distinction. The panels read `getRole()` and
 * branch on it.
 */

import { CRITICAL_RATIO, WOUNDED_RATIO } from './StatBars.js';

/** @typedef {import('../types/view.js').ViewRole} ViewRole */

/** @type {ViewRole[]} */
export const VIEW_ROLES = ['gm', 'player'];

/**
 * @param {ViewRole} role
 * @returns {boolean}
 */
export function isGM(role) {
  return role === 'gm';
}

/**
 * Abstract a current and max HP pair into the coarse status band that
 * players see, instead of exact numbers. This lets a GM show the party a
 * monster's condition without leaking its stat block. The bands, by
 * fraction of max: full is "Unharmed", above half is "Healthy", above a
 * quarter is "Bloodied", anything still standing is "Badly wounded", and
 * zero or below is "Down". A non-positive max reads "Unknown". The two
 * fractions are the thresholds the HP bars color by, from
 * `view/StatBars.js`, so a band a player reads matches the band the GM's
 * bar shows.
 * @param {number} current
 * @param {number} max
 * @returns {string}
 */
export function hpBand(current, max) {
  if (max <= 0) return 'Unknown';
  if (current <= 0) return 'Down';
  const fraction = current / max;
  if (fraction >= 1) return 'Unharmed';
  if (fraction > WOUNDED_RATIO) return 'Healthy';
  if (fraction > CRITICAL_RATIO) return 'Bloodied';
  return 'Badly wounded';
}
