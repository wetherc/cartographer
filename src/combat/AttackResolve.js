import { effectiveStatBlock } from '../entities/Encounter.js';
import { effectiveStats } from '../entities/Equipment.js';
import { DIE_SIDES } from '../dice/DiceRoller.js';
import { abilityModifier } from '../entities/Modifiers.js';

/**
 * The 5e rules a weapon attack resolves by, kept apart from the dialog and dice
 * tray that surround them in `app/weaponAttack.js`. Everything here takes plain
 * values and returns plain values, so the hit/crit table and the damage-dice
 * assembly are unit-testable without a DOM or an app context.
 */

/** @typedef {import('../types/entities.js').DamagePart} DamagePart */
/** @typedef {import('../types/dice.js').DieType} DieType */

/**
 * The stat map an attacker rolls from. An encounter carries a stat block that
 * its own modifiers apply to; a party character carries ability scores that
 * equipped gear may buff. Either way the caller gets one ability-to-score map.
 * @param {import('../types/entities.js').Encounter | import('../types/entities.js').Character} attacker
 * @returns {Record<string, number>}
 */
export function attackerStats(attacker) {
  return 'statBlock' in attacker ? effectiveStatBlock(attacker) : effectiveStats(attacker);
}

/**
 * How a d20 attack roll lands. A natural 1 always misses and a natural 20
 * always hits and crits, both regardless of AC; anything else compares the
 * modified total against AC. `outcome` is the phrasing the travelogue uses, so
 * the log and the toast can never disagree about what happened.
 * @param {{ natural: number, total: number, ac: number }} roll
 * @returns {{ crit: boolean, hit: boolean, outcome: string }}
 */
export function resolveAttack({ natural, total, ac }) {
  const crit = natural === 20;
  const hit = natural !== 1 && (crit || total >= ac);
  const outcome = crit ? 'critical hit' : natural === 1 ? 'natural 1, miss' : hit ? 'hit' : 'miss';
  return { crit, hit, outcome };
}

/**
 * The damage dice a hit rolls: the weapon's own terms, plus any extra dice the
 * pre-roll dialog added. A critical hit doubles the count of every die, the
 * dialog's dice included, because they are damage dice like the rest. Flat
 * bonuses are not dice and so are not doubled; they reach the roll through
 * `damageModifier` instead.
 *
 * The added dice take the weapon's own damage type so they group with it in the
 * readout, falling back to `bonus` for a weapon that lists no damage at all.
 * @param {DamagePart[]} weaponDamage
 * @param {{ crit: boolean, bonusDice?: number, bonusDie?: DieType }} opts
 * @returns {DamagePart[]}
 */
export function damageParts(weaponDamage, { crit, bonusDice = 0, bonusDie = 'd4' }) {
  const parts = weaponDamage.map((part) => (crit ? { ...part, count: part.count * 2 } : part));
  const extra = Math.max(0, Math.trunc(bonusDice) || 0);
  if (extra > 0) {
    parts.push({
      count: crit ? extra * 2 : extra,
      sides: DIE_SIDES[bonusDie],
      damageType: parts[0]?.damageType ?? 'bonus',
    });
  }
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
