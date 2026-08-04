/**
 * The two d20 rolls a character makes outside combat: saving throws and
 * ability checks. This module says what a creature adds to each, and how the
 * app resolves one. Every function is pure. The d20 comes from the injected
 * random number generator. Nothing here reads or writes a character.
 */

import { roll } from '../dice/DiceRoller.js';
import { abilityModifier, proficiencyBonus, ABILITY_SCORES } from './Modifiers.js';
import { effectiveStats } from './Equipment.js';
import { isProficientSave, isProficientSkill, hasExpertise } from './Proficiencies.js';
import { rollRiders } from './Riders.js';
import { SKILL_ABILITIES, SKILL_IDS } from '../data/skills.js';

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
 * This function works for characters only. A creature keeps its ability
 * scores in a different field and carries no proficiency lists. A
 * creature's save bonus is still whatever the GM types into the cast dialog.
 * @param {Character} character
 * @param {string} ability one of the six ability keys
 * @returns {number}
 */
export function saveBonus(character, ability) {
  const mod = abilityModifier(effectiveStats(character)[ability] ?? 10);
  return isProficientSave(character, ability) ? mod + proficiencyBonus(character.level ?? 1) : mod;
}

/**
 * Roll one d20 plus a bonus against a DC. A save and a check differ only in
 * which riders they pick up and in whether a DC is required, so both go
 * through here and cannot drift apart.
 *
 * The roll beats the DC on a tie, as the 5e rule states. A null DC rolls and
 * judges nothing. Advantage and disadvantage use the shared dice roller,
 * which keeps the discarded die in the result. The rider dice draw before the
 * d20.
 * @param {number} bonus
 * @param {number | null} dc
 * @param {import('../types/entities.js').RiderRoll} kind
 * @param {{ mode?: RollMode, rng?: RandomFn, conditions?: Condition[] }} opts
 * @returns {CheckResult}
 */
function resolveD20(bonus, dc, kind, { mode = 'normal', rng = Math.random, conditions = [] }) {
  const rider = rollRiders(conditions, kind, rng);
  const result = roll({ counts: { d20: 1 }, modifier: bonus + rider.modifier, mode }, rng);
  return {
    roll: result,
    total: result.total,
    dc,
    natural: result.results[0]?.rolls[0] ?? 0,
    success: dc === null ? null : result.total >= dc,
    rider: rider.note ? rider : null,
  };
}

/**
 * Resolve a save from a bonus already worked out.
 *
 * This function is split from `savingThrow` because the spell resolver has a
 * bonus but no character. The target can be a foe whose save the GM entered
 * by hand. Both paths must resolve a save the same way.
 *
 * `conditions` are the chips the roller holds. Any of them that rides on a
 * save rolls here and joins the bonus, so Bless and Bane reach every save in
 * the app through this one function.
 * @param {number} bonus
 * @param {number} dc
 * @param {{ mode?: RollMode, rng?: RandomFn, conditions?: Condition[] }} [opts]
 * @returns {SaveResult}
 */
export function resolveSave(bonus, dc, opts = {}) {
  return /** @type {SaveResult} */ (resolveD20(bonus, dc, 'save', opts));
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

/**
 * One resolved ability check. The shape matches {@link SaveResult}, except
 * that the DC may be absent. A GM often asks for a check with no number in
 * mind and reads the total out loud, so `dc` is nullable and `success` is
 * null along with it.
 * @typedef {{
 *   roll: DiceResult,
 *   total: number,
 *   dc: number | null,
 *   natural: number,
 *   success: boolean | null,
 *   rider: { modifier: number, note: string } | null,
 * }} CheckResult
 */

/**
 * Which ability a check key rolls against. A skill id resolves through the
 * skill table, and an ability key stands for itself, which is how a bare
 * Strength check works. Anything else returns null.
 * @param {string} key a skill id or one of the six ability keys
 * @returns {string | null}
 */
export function checkAbility(key) {
  if (SKILL_IDS.includes(key)) return SKILL_ABILITIES[key];
  return ABILITY_SCORES.includes(key) ? key : null;
}

/**
 * What a character adds to an ability check. The value is the ability
 * modifier, read from the equipment-adjusted scores. It adds the proficiency
 * bonus once when the character is proficient in the skill, and a second time
 * when the character has expertise in it. A bare ability key is never
 * proficient, because proficiency in 5e attaches to a skill and not to an
 * ability. A key that names neither a skill nor an ability reads as a score
 * of 10, the same default the rest of the stat code uses.
 *
 * This function works for characters only, for the same reason
 * {@link saveBonus} does. A foe carries no proficiency lists.
 * @param {Character} character
 * @param {string} key a skill id or one of the six ability keys
 * @returns {number}
 */
export function checkBonus(character, key) {
  const ability = checkAbility(key);
  const mod = abilityModifier((ability ? effectiveStats(character)[ability] : undefined) ?? 10);
  if (!SKILL_IDS.includes(key) || !isProficientSkill(character, key)) return mod;
  const bonus = proficiencyBonus(character.level ?? 1);
  return mod + (hasExpertise(character, key) ? bonus * 2 : bonus);
}

/**
 * Resolve an ability check from a bonus already worked out. It rolls one d20
 * plus the bonus, and it beats the DC on a tie. Passing a DC of null rolls
 * the check and reports the total without judging it.
 *
 * This function is split from `abilityCheck` for the same reason
 * {@link resolveSave} is split from `savingThrow`. A caller may hold a bonus
 * without holding the creature it came from.
 *
 * `conditions` are the chips the roller holds. Any of them that rides on a
 * check rolls here and joins the bonus, which is how Guidance reaches a check.
 * @param {number} bonus
 * @param {number | null} dc
 * @param {{ mode?: RollMode, rng?: RandomFn, conditions?: Condition[] }} [opts]
 * @returns {CheckResult}
 */
export function resolveCheck(bonus, dc, opts = {}) {
  return resolveD20(bonus, dc, 'check', opts);
}

/**
 * Roll a character's ability check against a DC, or against nothing. The
 * result names the ability it used and reports whether proficiency and
 * expertise were in the bonus, so a readout can explain the number.
 *
 * The character's own chips ride along without the caller asking, as they do
 * on a save. A caller can still pass its own `conditions` to override the
 * list.
 * @param {Character} character
 * @param {string} key a skill id or one of the six ability keys
 * @param {number | null} [dc]
 * @param {{ mode?: RollMode, rng?: RandomFn, conditions?: Condition[] }} [opts]
 * @returns {CheckResult & { ability: string | null, proficient: boolean, expert: boolean }}
 */
export function abilityCheck(character, key, dc = null, opts = {}) {
  return {
    ...resolveCheck(checkBonus(character, key), dc, {
      conditions: character.conditions ?? [],
      ...opts,
    }),
    ability: checkAbility(key),
    proficient: isProficientSkill(character, key),
    expert: hasExpertise(character, key),
  };
}

/**
 * The passive score for a check bonus: 10 plus the bonus, which is what the
 * creature gets when it does not roll. Advantage on the check raises the
 * score by 5, and disadvantage lowers it by 5.
 * @param {number} bonus
 * @param {RollMode} [mode]
 * @returns {number}
 */
export function passiveScore(bonus, mode = 'normal') {
  const swing = mode === 'advantage' ? 5 : mode === 'disadvantage' ? -5 : 0;
  return 10 + bonus + swing;
}

/**
 * A character's passive Perception, the score a GM compares a hidden thing
 * against when nobody says they are looking.
 * @param {Character} character
 * @param {RollMode} [mode]
 * @returns {number}
 */
export function passivePerception(character, mode = 'normal') {
  return passiveScore(checkBonus(character, 'perception'), mode);
}
