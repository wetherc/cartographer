import { exhaustionLevel, exhaustionSlant } from './Exhaustion.js';
/**
 * The two d20 rolls a character makes outside combat: saving throws and
 * ability checks. This module says what a creature adds to each, and how the
 * app resolves one. Every function is pure. The d20 comes from the injected
 * random number generator. Nothing here reads or writes a character.
 */

import { roll } from '../dice/DiceRoller.js';
import { abilityModifier, ABILITY_SCORES } from './Modifiers.js';
import { characterProficiency } from './Multiclass.js';
import { effectiveStats } from './Equipment.js';
import { isProficientSave, isProficientSkill, hasExpertise } from './Proficiencies.js';
import { rollRiders } from './Riders.js';
import { rollMode } from './ConditionEffects.js';
import { riderSources } from './FeatChoices.js';
import { SKILL_ABILITIES, SKILL_IDS } from '../data/skills.js';
import { hasFeature } from './Features.js';
import { listASIChoices } from './LevelUp.js';
import { isLucky } from './RaceTraits.js';

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
 *   rider: { modifier: number, note: string, spent: string[] } | null,
 * }} SaveResult
 */

/**
 * What a character adds to a saving throw in one ability. This value is the
 * ability modifier, read from the equipment-adjusted scores so a
 * stat-boosting item counts. The value adds the proficiency bonus when the
 * class grants that save, or in every save once the monk has Diamond Soul.
 * A paladin with Aura of Protection adds its own CHA modifier, at least +1.
 * An ability with no score for the character reads
 * as 10, the same default the rest of the stat code uses. Exhaustion does
 * not change the bonus. From level 3 it slants the roll instead (see
 * `Exhaustion.exhaustionSlant`).
 *
 * This function works for characters only. A creature keeps its ability scores
 * in a different field and climbs the proficiency ladder by challenge rating,
 * so `CreatureChecks.creatureSaveBonus` is its counterpart.
 * @param {Character} character
 * @param {string} ability one of the six ability keys
 * @returns {number}
 */
export function saveBonus(character, ability) {
  const mod = abilityModifier(effectiveStats(character)[ability] ?? 10);
  const proficient = proficientSave(character, ability) ? characterProficiency(character) : 0;
  return mod + proficient + auraBonus(character);
}

/**
 * What Aura of Protection (paladin 6) adds to the paladin's own saves: the
 * CHA modifier, at least +1. A character without the feature gets 0. The
 * aura also covers allies within 10 feet, which the GM applies at the table.
 * @param {Character} character
 * @returns {number}
 */
export function auraBonus(character) {
  if (!hasFeature(character, AURA_OF_PROTECTION)) return 0;
  return Math.max(1, abilityModifier(effectiveStats(character).CHA ?? 10));
}

/** The paladin feature that adds the CHA modifier to the paladin's saves. */
const AURA_OF_PROTECTION = 'Aura of Protection';

/** The monk feature that grants proficiency in every saving throw. */
const DIAMOND_SOUL = 'Diamond Soul';

/**
 * Whether a character adds proficiency to a save in one ability: the class
 * grants that save, or the character has Diamond Soul.
 * @param {Character} character
 * @param {string} ability
 * @returns {boolean}
 */
export function proficientSave(character, ability) {
  return isProficientSave(character, ability) || hasFeature(character, DIAMOND_SOUL);
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
 *
 * With `lucky` (the Halfling trait), a natural 1 on the kept die rolls the
 * d20 again, and the new roll stands.
 *
 * With `minFace` (Reliable Talent), a kept face below it counts as
 * `minFace` in the total. `natural` still reports the face the die showed.
 * @param {number} bonus
 * @param {number | null} dc
 * @param {import('../types/entities.js').RiderRoll} kind
 * @param {{ mode?: RollMode, rng?: RandomFn, conditions?: import('./Riders.js').RiderSource[], lucky?: boolean, minFace?: number }} opts
 * @returns {CheckResult}
 */
function resolveD20(
  bonus,
  dc,
  kind,
  { mode = 'normal', rng = Math.random, conditions = [], lucky = false, minFace = 1 },
) {
  const rider = rollRiders(conditions, kind, rng);
  const once = () => roll({ counts: { d20: 1 }, modifier: bonus + rider.modifier, mode }, rng);
  const first = once();
  const result = lucky && first.results[0]?.rolls[0] === 1 ? once() : first;
  const natural = result.results[0]?.rolls[0] ?? 0;
  const total = result.total + Math.max(0, minFace - natural);
  return {
    roll: result,
    total,
    dc,
    natural,
    success: dc === null ? null : total >= dc,
    rider: rider.note ? rider : null,
  };
}

/** The Rogue 11 feature that treats a d20 below 10 as a 10 on a proficient
 * ability check. */
const RELIABLE_TALENT = 'Reliable Talent';

/**
 * The lowest d20 face a character's check on `key` can count as: 10 when the
 * character has Reliable Talent and is proficient in the skill, else 1.
 * Attack rolls and saves never read this.
 * @param {Character} character
 * @param {string} key a skill id or one of the six ability keys
 * @returns {number}
 */
export function checkMinFace(character, key) {
  return isProficientSkill(character, key) && hasFeature(character, RELIABLE_TALENT) ? 10 : 1;
}

/**
 * Resolve a save from a bonus already worked out.
 *
 * This function is split from `savingThrow` because the spell resolver has a
 * bonus but no character. The target can be a creature, whose bonus comes from
 * `CreatureChecks`. Both paths must resolve a save the same way.
 *
 * `conditions` are the chips the roller holds. Any of them that rides on a
 * save rolls here and joins the bonus, so Bless and Bane reach every save in
 * the app through this one function.
 *
 * With `ability` and no `mode`, the chips also slant the roll, so Restrained
 * gives disadvantage on a DEX save, and Haste gives advantage on one. A
 * caller that passes `mode` has already folded the chips in. `slants` adds
 * slants that do not come from a chip, such as the advantage of War Caster,
 * and they fold in with the chip slants under the 5e rule.
 * @param {number} bonus
 * @param {number} dc
 * @param {{
 *   mode?: RollMode,
 *   rng?: RandomFn,
 *   conditions?: import('./Riders.js').RiderSource[],
 *   ability?: string,
 *   slants?: ('advantage' | 'disadvantage' | null)[],
 *   tired?: number,
 *   lucky?: boolean,
 * }} [opts]
 * @returns {SaveResult}
 */
export function resolveSave(bonus, dc, { ability, slants = [], tired = 0, ...opts } = {}) {
  const slant = ability
    ? rollMode({ roller: opts.conditions, kind: 'save', ability, tired }, slants)
    : null;
  const mode = opts.mode ?? slant ?? 'normal';
  return /** @type {SaveResult} */ (resolveD20(bonus, dc, 'save', { ...opts, mode }));
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
 * @param {{ mode?: RollMode, rng?: RandomFn, conditions?: import('./Riders.js').RiderSource[], slants?: ('advantage' | 'disadvantage' | null)[] }} [opts]
 * @returns {SaveResult & { proficient: boolean }}
 */
export function savingThrow(character, ability, dc, opts = {}) {
  return {
    ...resolveSave(saveBonus(character, ability), dc, {
      conditions: riderSources(character),
      ability,
      tired: exhaustionLevel(character),
      lucky: isLucky(character),
      ...opts,
    }),
    proficient: proficientSave(character, ability),
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
 *   rider: { modifier: number, note: string, spent: string[] } | null,
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
 * when the character has expertise in it. A check without proficiency adds
 * half the proficiency bonus instead, through {@link halfProficiency}. A bare ability key is never
 * proficient, because proficiency in 5e attaches to a skill and not to an
 * ability. A key that names neither a skill nor an ability reads as a score
 * of 10, the same default the rest of the stat code uses. Exhaustion does
 * not change the bonus. It slants the roll instead.
 *
 * This function works for characters only, for the same reason
 * {@link saveBonus} does. `CreatureChecks.creatureCheckBonus` is the
 * counterpart for a creature.
 * @param {Character} character
 * @param {string} key a skill id or one of the six ability keys
 * @returns {number}
 */
export function checkBonus(character, key) {
  const ability = checkAbility(key);
  const mod = abilityModifier((ability ? effectiveStats(character)[ability] : undefined) ?? 10);
  if (!SKILL_IDS.includes(key) || !isProficientSkill(character, key)) {
    return mod + halfProficiency(character, ability);
  }
  const bonus = characterProficiency(character);
  return mod + (hasExpertise(character, key) ? bonus * 2 : bonus);
}

/** The bard feature that adds half proficiency to checks without it. */
const JACK_OF_ALL_TRADES = 'Jack of All Trades';

/** The Champion feature that adds half proficiency, rounded up, to STR, DEX,
 * and CON checks without proficiency. */
const REMARKABLE_ATHLETE = 'Remarkable Athlete';

/** The abilities whose checks Remarkable Athlete improves. */
const ATHLETE_ABILITIES = ['STR', 'DEX', 'CON'];

/**
 * What a character adds to a check that does not use proficiency. Jack of
 * All Trades adds half the proficiency bonus, rounded down, to every such
 * check. Remarkable Athlete adds half, rounded up, to a STR, DEX, or CON
 * check. The two do not stack, so the larger one applies. A character with
 * neither feature adds 0.
 * @param {Character} character
 * @param {string | null} ability the ability of the check
 * @returns {number}
 */
export function halfProficiency(character, ability) {
  const half = characterProficiency(character) / 2;
  const athlete =
    ability && ATHLETE_ABILITIES.includes(ability) && hasFeature(character, REMARKABLE_ATHLETE);
  if (athlete) return Math.ceil(half);
  return hasFeature(character, JACK_OF_ALL_TRADES) ? Math.floor(half) : 0;
}

/**
 * What a character adds to its initiative roll. The value
 * is the DEX modifier of the effective score, plus the half proficiency of
 * Jack of All Trades or Remarkable Athlete (initiative is a DEX check), plus
 * the bonus of a feat such as Alert. Exhaustion slants the roll in
 * `InitiativeRoll.initiativeSlant` and does not change this value.
 * @param {Character} character
 * @returns {number}
 */
export function initiativeBonus(character) {
  const dex = abilityModifier(effectiveStats(character).DEX ?? 10);
  const feats = listASIChoices(character).reduce(
    (sum, choice) => sum + (choice.type === 'feat' ? (choice.initiativeBonus ?? 0) : 0),
    0,
  );
  return dex + halfProficiency(character, 'DEX') + feats;
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
 * `minFace` comes from {@link checkMinFace}.
 * @param {number} bonus
 * @param {number | null} dc
 * @param {{ mode?: RollMode, rng?: RandomFn, conditions?: import('./Riders.js').RiderSource[], lucky?: boolean, minFace?: number }} [opts]
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
 *
 * The tests call this function, and no app code does.
 * @param {Character} character
 * @param {string} key a skill id or one of the six ability keys
 * @param {number | null} [dc]
 * @param {{ mode?: RollMode, rng?: RandomFn, conditions?: import('./Riders.js').RiderSource[] }} [opts]
 * @returns {CheckResult & { ability: string | null, proficient: boolean, expert: boolean }}
 */
export function abilityCheck(character, key, dc = null, opts = {}) {
  return {
    ...resolveCheck(checkBonus(character, key), dc, {
      conditions: riderSources(character),
      lucky: isLucky(character),
      minFace: checkMinFace(character, key),
      ...(tiredCheck(character) ? { mode: /** @type {const} */ ('disadvantage') } : {}),
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
  const tired = tiredCheck(character);
  // Advantage and the disadvantage of exhaustion cancel to a straight score.
  const net = !tired ? mode : mode === 'advantage' ? 'normal' : tired;
  return passiveScore(checkBonus(character, 'perception'), net);
}

/**
 * The slant that exhaustion puts on a character's ability checks, or null.
 * @param {Character} character
 * @returns {'disadvantage' | null}
 */
function tiredCheck(character) {
  return exhaustionSlant(exhaustionLevel(character), 'check');
}
