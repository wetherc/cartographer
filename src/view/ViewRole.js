/**
 * The viewer-role split: the same campaign renders differently for the GM
 * (full truth — exact HP, authored notes, every handout) and for players (a
 * coarse HP band, no secret notes, only revealed handouts). This module owns
 * the pure pieces of that distinction; the panels read `getRole()` and branch.
 */

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
 * Abstract a current/max HP into the coarse status band players see instead of
 * exact numbers, so a GM can show the party a monster's condition without
 * leaking its stat block. Bands, by fraction of max: full is "Unharmed", above
 * half "Healthy", above a quarter "Bloodied", anything still standing "Badly
 * wounded", and zero or below "Down". A non-positive max reads "Unknown".
 * @param {number} current
 * @param {number} max
 * @returns {string}
 */
export function hpBand(current, max) {
  if (max <= 0) return 'Unknown';
  if (current <= 0) return 'Down';
  const fraction = current / max;
  if (fraction >= 1) return 'Unharmed';
  if (fraction > 0.5) return 'Healthy';
  if (fraction > 0.25) return 'Bloodied';
  return 'Badly wounded';
}
