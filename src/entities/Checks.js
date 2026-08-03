/**
 * Saving throws: what a creature adds to one, and how the module resolves
 * one. Every function is pure. The d20 comes from the injected random number
 * generator. Nothing here reads or writes a character.
 */

import { roll } from '../dice/DiceRoller.js';
import { abilityModifier, proficiencyBonus } from './Modifiers.js';
import { effectiveStats } from './Equipment.js';
import { isProficientSave } from './Proficiencies.js';
import { rollRiders } from './Riders.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/entities.js').Condition} Condition */
/** @typedef {import('../types/dice.js').DiceResult} DiceResult */
/** @typedef {import('../types/dice.js').RollMode} RollMode */
/** @typedef {import('../types/dice.js').RandomFn} RandomFn */

/**
 * One resolved save: the whole dice result, so a caller can format it the way
 * the tray does. It also carries the total against the DC, the kept d20 face,
 * and whether the roll beat the DC. A natural 1 or 20 has no automatic
 * outcome on a save, unlike an attack roll. The log reports `natural`, but
 * the app does not act on it.
 * `rider` reports what the roller's condition chips added, or null when it
 * held none that touch a save. The modifier is already inside `total`.
 * @typedef {{
 *   roll: DiceResult,
 *   total: number,
 *   dc: number,
 *   natural: number,
 *   success: boolean,
 *   rider: { modifier: number, note: string } | null,
 * }} SaveResult
 */

/**
 * What a character adds to a saving throw in one ability. This value is the
 * ability modifier, read from the equipment-adjusted scores so a
 * stat-boosting item counts. The value adds the proficiency bonus when the
 * class grants that save. An ability with no score for the character reads
 * as 10, the same default the rest of the stat code uses.
 *
 * This function works for characters only. An encounter or an NPC keeps its
 * ability scores in a different field and carries no proficiency lists. A
 * foe's save bonus is still whatever the GM types into the cast dialog.
 * @param {Character} character
 * @param {string} ability one of the six ability keys
 * @returns {number}
 */
export function saveBonus(character, ability) {
  const mod = abilityModifier(effectiveStats(character)[ability] ?? 10);
  return isProficientSave(character, ability) ? mod + proficiencyBonus(character.level ?? 1) : mod;
}

/**
 * Resolve a save from a bonus already worked out. It rolls one d20 plus the
 * bonus against the DC, and the save succeeds on a tie, as the 5e rule
 * states. Advantage and disadvantage use the shared dice roller, which keeps
 * the discarded die in the result.
 *
 * This function is split from `savingThrow` because the spell resolver has a
 * bonus but no character. The target can be a foe whose save the GM entered
 * by hand. Both paths must resolve a save the same way.
 *
 * `conditions` are the chips the roller holds. Any of them that rides on a
 * save rolls here and joins the bonus, so Bless and Bane reach every save in
 * the app through this one function. The rider dice draw before the d20.
 * @param {number} bonus
 * @param {number} dc
 * @param {{ mode?: RollMode, rng?: RandomFn, conditions?: Condition[] }} [opts]
 * @returns {SaveResult}
 */
export function resolveSave(
  bonus,
  dc,
  { mode = 'normal', rng = Math.random, conditions = [] } = {},
) {
  const rider = rollRiders(conditions, 'save', rng);
  const result = roll({ counts: { d20: 1 }, modifier: bonus + rider.modifier, mode }, rng);
  return {
    roll: result,
    total: result.total,
    dc,
    natural: result.results[0]?.rolls[0] ?? 0,
    success: result.total >= dc,
    rider: rider.note ? rider : null,
  };
}

/**
 * Roll a character's saving throw in one ability against a DC. The result
 * reports whether the bonus included proficiency, so a readout can explain
 * the number.
 *
 * The character's own chips ride along without the caller asking, because the
 * character is right here to read them from. A blessed caster therefore holds
 * a spell against damage more easily, which is the printed rule. A caller can
 * still pass its own `conditions` to override the list.
 * @param {Character} character
 * @param {string} ability
 * @param {number} dc
 * @param {{ mode?: RollMode, rng?: RandomFn, conditions?: Condition[] }} [opts]
 * @returns {SaveResult & { proficient: boolean }}
 */
export function savingThrow(character, ability, dc, opts = {}) {
  return {
    ...resolveSave(saveBonus(character, ability), dc, {
      conditions: character.conditions ?? [],
      ...opts,
    }),
    proficient: isProficientSave(character, ability),
  };
}
