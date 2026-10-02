/**
 * A save that a creature's weapon forces on a hit, such as the wolf bite's DC
 * 11 Strength save against falling prone. The weapon stores the rider as
 * `onHitSave`, and the attack code rolls the defender's save after the damage
 * lands. A failed save puts the named condition on the defender.
 *
 * Every function is pure. The attack code in `app/weaponAttack.js` rolls the
 * save and writes the chip.
 */

import { ABILITY_SCORES } from '../entities/Modifiers.js';
import { CONDITIONS } from '../entities/Conditions.js';

/** @typedef {import('../types/entities.js').HitSave} HitSave */

/** The highest DC a typed rider may state. A sanity ceiling on input. */
const MAX_DC = 30;

/**
 * Coerce a stored or typed rider into a clean one, or return null when it
 * names no known ability, no DC of 1 or more, or no known condition. The
 * condition name takes the spelling of `Conditions.CONDITIONS`.
 * @param {unknown} value
 * @returns {HitSave | null}
 */
export function normalizeHitSave(value) {
  if (!value || typeof value !== 'object') return null;
  const raw = /** @type {Record<string, unknown>} */ (value);
  const ability = String(raw.ability ?? '').toUpperCase();
  const dc = Math.floor(Number(raw.dc));
  const key = String(raw.condition ?? '').toLowerCase();
  const condition = CONDITIONS.find((c) => c.toLowerCase() === key);
  if (!ABILITY_SCORES.includes(ability) || !(dc >= 1) || !condition) return null;
  return { ability, dc: Math.min(dc, MAX_DC), condition };
}

/**
 * The rider of a weapon, or null for a weapon with none. A character's
 * inventory weapon has no `onHitSave` field, so it reads as null.
 * @param {object} weapon
 * @returns {HitSave | null}
 */
export function hitSaveOf(weapon) {
  return 'onHitSave' in weapon ? normalizeHitSave(weapon.onHitSave) : null;
}

/**
 * The log line of one rider save. It names the total and not the bonus, so a
 * Player tab can read the same line.
 * @param {{ defenderName: string, weaponName: string, rider: HitSave, total: number, success: boolean }} save
 * @returns {string}
 */
export function hitSaveLine({ defenderName, weaponName, rider, total, success }) {
  const result = success ? 'resists' : `fails and is ${rider.condition}`;
  return `${weaponName}: ${defenderName} rolls ${total} on a DC ${rider.dc} ${rider.ability} save and ${result}.`;
}
