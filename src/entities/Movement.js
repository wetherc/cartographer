/**
 * How fast a character walks. This is a small module of its own because more
 * than one rule cuts a speed, and each one belongs in `walkSpeed` rather than
 * in a second speed calculation somewhere else. Heavy armor the wearer is not
 * strong enough for is one such rule, and exhaustion is the other.
 *
 * Nothing moves a token by feet yet, so the value is informational. It is what
 * the sheet shows the GM.
 */

import { armorTraits, effectiveStats, equippedIndex } from './Equipment.js';
import { resolveRace } from './Races.js';
import { exhaustionLevel, speedPenalty } from './Exhaustion.js';

/** @typedef {import('../types/entities.js').Character} Character */

/** The walking speed of a character whose race states none. Most 5e races
 * walk this far. */
export const DEFAULT_SPEED = 30;

/**
 * The character's speed before any penalty, from its race. A hand-typed race
 * carries no definition, so it walks the default rather than its real speed.
 *
 * This reads the live catalog through `resolveRace`, not the stored snapshot,
 * so a GM editing a race's speed changes every character of that race. The
 * snapshot matters only for ability increases, because those are already baked
 * into the scores.
 * @param {Character} character
 * @returns {number}
 */
export function baseSpeed(character) {
  const speed = Number(resolveRace(character)?.speed);
  return Number.isFinite(speed) && speed >= 0 ? speed : DEFAULT_SPEED;
}

/**
 * The speed the worn body armor costs: 10 feet when the armor states a
 * Strength requirement the character does not meet, else 0. The score checked
 * includes equipped buffs, so a +2 ring can carry a character over the line.
 * @param {Character} character
 * @returns {number}
 */
export function armorSpeedPenalty(character) {
  const required = armorTraits(equippedIndex(character).get('chest')).strength;
  if (!required) return 0;
  return (effectiveStats(character).STR ?? 10) < required ? 10 : 0;
}

/**
 * The character's walking speed in feet, with every penalty applied. The two
 * penalties add: armor too heavy to move in does not stop costing 10 feet
 * because the wearer is also tired. Never negative, so a slow race at a high
 * level of exhaustion stops rather than walking backwards.
 * @param {Character} character
 * @returns {number}
 */
export function walkSpeed(character) {
  return Math.max(0, baseSpeed(character) - armorSpeedPenalty(character) - speedPenalty(character));
}

/**
 * A sentence for the speed badge saying where the number came from, so a GM
 * who sees a slowed character knows what to blame: a piece of armor, a level of
 * exhaustion, or both.
 * @param {Character} character
 * @returns {string}
 */
export function speedNote(character) {
  const armor = armorSpeedPenalty(character);
  const tired = speedPenalty(character);
  const causes = [];
  if (armor) {
    const body = equippedIndex(character).get('chest');
    const required = armorTraits(body).strength;
    causes.push(`${armor} for wearing ${body?.name ?? 'armor'} without STR ${required}`);
  }
  if (tired) causes.push(`${tired} for exhaustion ${exhaustionLevel(character)}`);
  const base = `Walking speed: ${baseSpeed(character)} feet`;
  return causes.length ? `${base}, less ${causes.join(', and less ')}.` : `${base}.`;
}
