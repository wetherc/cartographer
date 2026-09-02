import { effectiveStatBlock, isCreature } from '../entities/Creature.js';
import { effectiveStats } from '../entities/Equipment.js';
import { creatureProficiencyBonus } from '../entities/CreatureChecks.js';
import { DIE_SIDES } from '../dice/DiceRoller.js';
import { abilityModifier, proficiencyBonus } from '../entities/Modifiers.js';

/**
 * The 5e rules a weapon attack resolves by. This module stays apart from the
 * dialog and dice tray that surround it in `app/weaponAttack.js`. Every
 * function here takes plain values and returns plain values, so a test run
 * can check the hit/crit table and the damage dice assembly without a DOM or
 * an app context.
 */

/** @typedef {import('../types/entities.js').DamagePart} DamagePart */
/** @typedef {import('../types/dice.js').DieType} DieType */

/**
 * The stat map an attacker rolls from. A creature carries a stat block that
 * its armor and timed modifiers apply to. A party character carries ability
 * scores that equipped gear can buff. Both kinds give the caller one
 * ability-to-score map.
 * @param {import('../types/creature.js').Creature | import('../types/entities.js').Character} attacker
 * @returns {Record<string, number>}
 */
export function attackerStats(attacker) {
  return isCreature(attacker)
    ? effectiveStatBlock(/** @type {import('../types/creature.js').Creature} */ (attacker))
    : effectiveStats(/** @type {import('../types/entities.js').Character} */ (attacker));
}

/**
 * The proficiency bonus an attacker adds to a weapon attack it is proficient
 * with. A character reads the level ladder at its character level. A creature
 * reads the same ladder its saves, skills, and spells use: the challenge
 * rating when it has one, else its authoring level, else its caster level,
 * else level 1. A CR 5 creature authored at level 1 therefore swings at +3,
 * the same bonus it gets on a trained save.
 * @param {import('../types/creature.js').Creature | import('../types/entities.js').Character} attacker
 * @returns {number}
 */
export function attackerProficiency(attacker) {
  return isCreature(attacker)
    ? creatureProficiencyBonus(/** @type {import('../types/creature.js').Creature} */ (attacker))
    : proficiencyBonus(/** @type {import('../types/entities.js').Character} */ (attacker).level);
}

/**
 * How a d20 attack roll lands. A natural 1 always misses. A natural 20 always
 * hits and crits, regardless of AC. Any other roll compares the modified
 * total against AC. `outcome` is the phrasing the travelogue uses, so the log
 * and the toast always agree on what happened.
 *
 * `autoCrit` turns any hit into a critical one. A paralyzed or unconscious
 * defender does that to a melee attacker. It never turns a miss into a hit,
 * so a natural 1 and a total under AC still fail.
 * @param {{ natural: number, total: number, ac: number, autoCrit?: boolean }} roll
 * @returns {{ crit: boolean, hit: boolean, outcome: string }}
 */
export function resolveAttack({ natural, total, ac, autoCrit = false }) {
  const hit = natural !== 1 && (natural === 20 || total >= ac);
  const crit = hit && (natural === 20 || autoCrit);
  const outcome = crit ? 'critical hit' : natural === 1 ? 'natural 1, miss' : hit ? 'hit' : 'miss';
  return { crit, hit, outcome };
}

/**
 * The damage dice a hit rolls: the weapon's own terms, plus any extra dice the
 * pre-roll dialog added. A critical hit doubles the count of every die,
 * including the dialog's dice, because they are damage dice like the rest.
 * Flat bonuses are not dice, so a critical hit does not double them. They
 * reach the roll through `damageModifier` instead.
 *
 * `sneakDice` is the Sneak Attack count, which is always d6 and doubles on a
 * critical hit like any other damage die.
 *
 * The added dice take the weapon's own damage type, so they group with it in
 * the readout. They fall back to `bonus` for a weapon that lists no damage at
 * all.
 * @param {DamagePart[]} weaponDamage
 * @param {{ crit: boolean, bonusDice?: number, bonusDie?: DieType, sneakDice?: number }} opts
 * @returns {DamagePart[]}
 */
export function damageParts(weaponDamage, { crit, bonusDice = 0, bonusDie = 'd4', sneakDice = 0 }) {
  const parts = weaponDamage.map((part) => (crit ? { ...part, count: part.count * 2 } : part));
  /** @param {number} count @param {DieType} die */
  const add = (count, die) => {
    const dice = Math.max(0, Math.trunc(count) || 0);
    if (dice === 0) return;
    parts.push({
      count: crit ? dice * 2 : dice,
      sides: DIE_SIDES[die],
      damageType: parts[0]?.damageType ?? 'bonus',
    });
  };
  add(bonusDice, bonusDie);
  add(sneakDice, 'd6');
  return parts;
}

/**
 * The flat addition to a damage roll: the attacker's ability modifier plus the
 * dialog's flat rider. Proficiency never reaches damage in 5e, so it is absent
 * by construction rather than subtracted somewhere later.
 * @param {number} abilityMod
 * @param {unknown} flatBonus whatever the dialog's number field held
 * @returns {number}
 */
export function damageModifier(abilityMod, flatBonus) {
  return abilityMod + (Number(flatBonus) || 0);
}

/**
 * The ability modifier an attack rolls with, from the attacker's stats and the
 * weapon's ability. An attacker missing that score is treated as having a 10 in
 * it, which is a flat +0 rather than a NaN attack bonus.
 * @param {Record<string, number>} stats
 * @param {string} ability
 * @returns {number}
 */
export function abilityModOf(stats, ability) {
  return abilityModifier(stats[ability] ?? 10);
}

/**
 * The note naming the d20 an advantage or disadvantage roll threw away, so the
 * log shows both dice the way the tray does. An ordinary roll drops nothing and
 * gets no note.
 * @param {{ dropped?: number[] } | undefined} d20 the tray's d20 result
 * @param {string | undefined} mode the roll's selection mode
 * @returns {string}
 */
export function droppedNote(d20, mode) {
  if (!d20?.dropped?.length) return '';
  return ` at ${mode} (dropped ${d20.dropped.join(',')})`;
}
