import { classLevelOf } from '../entities/Multiclass.js';

/**
 * The barbarian's Rage under the 2014 rules. A Rage lasts one minute (10
 * rounds). While it lasts, the barbarian adds a bonus to the damage of a
 * melee weapon attack that uses STR, resists bludgeoning, piercing, and
 * slashing damage, and rolls STR checks and STR saves with advantage. The
 * app writes all of this as the mods of one "Raging" chip, so the damage
 * roll, the damage defenses, and the roll modes read it the same way they
 * read a spell chip. The GM ends a Rage early by removing the chip.
 */

/** The name of the chip that a Rage leaves on the barbarian. */
export const RAGING = 'Raging';

/** How long a Rage lasts, in rounds. */
export const RAGE_ROUNDS = 10;

/**
 * The Rage damage bonus at one barbarian level: +2 at levels 1 to 8, +3 at
 * 9 to 15, and +4 from 16.
 * @param {number} level
 * @returns {number}
 */
export function rageDamageBonus(level) {
  if (level >= 16) return 4;
  if (level >= 9) return 3;
  return 2;
}

/**
 * The mods of the Raging chip of one character.
 * @param {import('../types/entities.js').Character} character
 * @returns {import('../types/entities.js').ChipMods}
 */
export function rageMods(character) {
  return {
    resist: ['bludgeoning', 'piercing', 'slashing'],
    saveAdvantage: ['STR'],
    checkAdvantage: ['STR'],
    meleeDamage: rageDamageBonus(classLevelOf(character, 'barbarian')),
  };
}

/**
 * The extra damage that a holder's chips add to one weapon hit. Only a
 * melee swing that uses STR gets it, and two Raging chips do not stack, so
 * the highest bonus counts.
 * @param {import('../types/entities.js').Condition[] | undefined} conditions
 * @param {{ melee: boolean, ability: string }} swing
 * @returns {number}
 */
export function chipMeleeDamage(conditions, { melee, ability }) {
  if (!melee || ability !== 'STR') return 0;
  return Math.max(0, ...(conditions ?? []).map((c) => c.mods?.meleeDamage ?? 0));
}

/**
 * The log line of a Rage.
 * @param {string} actorName
 * @param {number} bonus the melee damage bonus
 * @returns {string}
 */
export function rageLine(actorName, bonus) {
  return `${actorName} enters a Rage: +${bonus} melee damage with STR, resistance to bludgeoning, piercing, and slashing damage, and advantage on STR checks and saves for 1 minute.`;
}
