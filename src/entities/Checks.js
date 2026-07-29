/**
 * Saving throws: what a creature adds to one, and how one resolves. Pure — the
 * d20 comes from the injected RNG, and nothing here reads or writes a character.
 */

import { roll } from '../dice/DiceRoller.js';
import { abilityModifier, proficiencyBonus } from './Modifiers.js';
import { effectiveStats } from './Equipment.js';
import { isProficientSave } from './Proficiencies.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/dice.js').DiceResult} DiceResult */
/** @typedef {import('../types/dice.js').RollMode} RollMode */
/** @typedef {import('../types/dice.js').RandomFn} RandomFn */

/**
 * One resolved save: the whole dice result (so a caller can format it the way
 * the tray does), its total against the DC, the kept d20 face, and whether it
 * beat the DC. A natural 1 or 20 carries no automatic outcome on a save, unlike
 * an attack roll, so `natural` is reported for the log rather than acted on.
 * @typedef {{
 *   roll: DiceResult,
 *   total: number,
 *   dc: number,
 *   natural: number,
 *   success: boolean,
 * }} SaveResult
 */

/**
 * What a character adds to a saving throw in one ability: the ability modifier,
 * read from the equipment-adjusted scores so a stat-boosting item counts, plus
 * the proficiency bonus when the class granted that save. An ability the
 * character has no score for reads as 10, the same default the rest of the stat
 * code uses.
 *
 * Characters only. An encounter or an NPC keeps its ability scores in a
 * different field and carries no proficiency lists, so a foe's save bonus is
 * still whatever the GM types into the cast dialog.
 * @param {Character} character
 * @param {string} ability one of the six ability keys
 * @returns {number}
 */
export function saveBonus(character, ability) {
  const mod = abilityModifier(effectiveStats(character)[ability] ?? 10);
  return isProficientSave(character, ability) ? mod + proficiencyBonus(character.level ?? 1) : mod;
}

/**
 * Resolve a save from a bonus already worked out: one d20 plus the bonus
 * against the DC, succeeding on a tie as 5e does. Advantage and disadvantage
 * ride the shared dice roller, which keeps the discarded die in the result.
 *
 * Split from `savingThrow` because the spell resolver has a bonus but no
 * character — the target may be a foe whose save the GM entered by hand — and
 * both paths should resolve a save the same way.
 * @param {number} bonus
 * @param {number} dc
 * @param {{ mode?: RollMode, rng?: RandomFn }} [opts]
 * @returns {SaveResult}
 */
export function resolveSave(bonus, dc, { mode = 'normal', rng = Math.random } = {}) {
  const result = roll({ counts: { d20: 1 }, modifier: bonus, mode }, rng);
  return {
    roll: result,
    total: result.total,
    dc,
    natural: result.results[0]?.rolls[0] ?? 0,
    success: result.total >= dc,
  };
}

/**
 * Roll a character's saving throw in one ability against a DC, reporting
 * whether the bonus included proficiency so a readout can say why the number
 * is what it is.
 * @param {Character} character
 * @param {string} ability
 * @param {number} dc
 * @param {{ mode?: RollMode, rng?: RandomFn }} [opts]
 * @returns {SaveResult & { proficient: boolean }}
 */
export function savingThrow(character, ability, dc, opts = {}) {
  return {
    ...resolveSave(saveBonus(character, ability), dc, opts),
    proficient: isProficientSave(character, ability),
  };
}
