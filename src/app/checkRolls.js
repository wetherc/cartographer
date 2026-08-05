/**
 * Rolling a saving throw or an ability check from the character sheet.
 *
 * The rule layer lives in `entities/Checks.js`, and it can roll a d20 on its
 * own. This module does not use that part of it. The dice tray also rolls when
 * asked to display a roll, so going through `savingThrow` or `abilityCheck`
 * would throw two d20s and show the wrong one. The bonus comes from the pure
 * helpers, the riders roll here, and the tray throws the only d20. This is the
 * same split `app/weaponAttack.js` uses.
 */

import { droppedNote } from '../combat/AttackResolve.js';
import { checkAbility, checkBonus, saveBonus } from '../entities/Checks.js';
import { stealthPenalty, unproficientWear } from '../entities/Equipment.js';
import { modeReasons, rollMode, saveOutcome } from '../entities/ConditionEffects.js';
import { formatModifier, proficiencyBonus } from '../entities/Modifiers.js';
import { hasExpertise, isProficientSave, isProficientSkill } from '../entities/Proficiencies.js';
import { rollRiders } from '../entities/Riders.js';
import { SKILL_IDS, skillName } from '../data/skills.js';
import { article } from '../util/text.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/entities.js').Character} Character */

/**
 * Which roll the sheet asked for. `key` is the ability for a save and the
 * skill id for a skill check. This matches the payload the sheet's check rows
 * send, spelled out here so the app layer imports no ui type.
 * @typedef {{ kind: 'save' | 'check', key: string }} CheckRequest
 */

/**
 * How much of a bonus is proficiency, and the word the log uses for it. The
 * word states expertise separately, so the doubling shows in the sentence as
 * well as in the number.
 *
 * A save is proficient or not. A skill can also carry expertise, which doubles
 * the bonus. A bare ability key is never proficient, because 5e attaches
 * proficiency to a skill and not to an ability. These are the same conditions
 * `checkBonus` applies, so the part below always sums back to the bonus.
 * @param {Character} character
 * @param {CheckRequest} event
 * @returns {{ amount: number, word: string }}
 */
function proficiencyPart(character, event) {
  const bonus = proficiencyBonus(character.level ?? 1);
  if (event.kind === 'save') {
    if (!isProficientSave(character, event.key)) return { amount: 0, word: '' };
    return { amount: bonus, word: `proficiency +${bonus}` };
  }
  if (!SKILL_IDS.includes(event.key) || !isProficientSkill(character, event.key)) {
    return { amount: 0, word: '' };
  }
  if (!hasExpertise(character, event.key)) return { amount: bonus, word: `proficiency +${bonus}` };
  return { amount: bonus * 2, word: `expertise +${bonus * 2}` };
}

/**
 * What the roll is called, in the voice the log and the toast both use.
 * @param {CheckRequest} event
 * @returns {string}
 */
function rollName(event) {
  if (event.kind === 'save') return `${event.key} saving throw`;
  return `${SKILL_IDS.includes(event.key) ? skillName(event.key) : event.key} check`;
}

/**
 * Roll one save or ability check for a character, then log it and toast the
 * total. The tray shows the d20 with the whole bonus already in its modifier
 * field, and the log line breaks that number back down: the ability modifier,
 * the proficiency or expertise it added, and whatever the character's condition
 * chips threw in. A Bless chip therefore reaches a save and a Guidance chip an
 * ability check, without the GM adding anything by hand.
 *
 * The chips also set the roll's mode. A poisoned character rolls an ability
 * check at disadvantage, and a restrained one rolls a Dexterity save the same
 * way. A chip that stops a creature moving fails its Strength and Dexterity
 * saves outright, and that failure is logged without a die.
 *
 * A sheet roll carries no DC. The GM reads the total against whatever they had
 * in mind, which is why nothing here judges success. A natural 1 or 20 is an
 * ordinary result on both rolls, so the log names it and the app does not act
 * on it.
 *
 * Nothing is written. The roll reads the character and its chips, and a rider
 * chip lasts as long as its duration does, so no roll spends one.
 * @param {AppContext} app
 * @param {Character} character
 * @param {CheckRequest} event
 * @param {{ rng?: () => number }} [opts] `rng` is the source for the rider
 *   dice. The d20 belongs to the tray, which owns its own randomness.
 */
export function rollCheck(app, character, event, { rng = Math.random } = {}) {
  const name = rollName(event);
  const phrase = `${article(name)} ${name}`;
  // A creature that cannot move fails a Strength or Dexterity save outright.
  // That failure never reaches the tray, so the sheet reports it on its own.
  const outcome = event.kind === 'save' ? saveOutcome(character.conditions, event.key) : null;
  if (outcome?.autoFail) {
    app.actions.logEvent(
      'roll',
      `${character.name} automatically fails ${phrase} (${outcome.failedBy}).`,
    );
    app.toasts.show(`${character.name} automatically fails ${phrase}.`);
    return;
  }
  const bonus =
    event.kind === 'save' ? saveBonus(character, event.key) : checkBonus(character, event.key);
  const proficiency = proficiencyPart(character, event);
  // The ability part is what is left after proficiency, rather than a second
  // read of the stat table. The breakdown then cannot drift from the bonus the
  // tray rolled with, whatever `Checks.js` decides a bonus is made of.
  const abilityMod = bonus - proficiency.amount;
  const ability = event.kind === 'save' ? event.key : (checkAbility(event.key) ?? event.key);
  // Rider dice roll outside the tray, the way an attack's do, so a bonus and a
  // penalty read the same in the log.
  const rider = rollRiders(character.conditions, event.kind, rng);
  // The chips also slant the roll. A sheet roll has no other side, so only the
  // character's own chips count, and the save's ability decides whether a chip
  // such as Restrained applies.
  const conditionQuery = /** @type {const} */ ({
    roller: character.conditions,
    kind: event.kind,
    ability,
  });
  // Armor the character is not trained for slants every STR and DEX roll, per
  // the 5e armor proficiency rule. The slant folds in with the chips, so an
  // advantage chip cancels it the way two chips cancel each other.
  const badWear = ability === 'STR' || ability === 'DEX' ? unproficientWear(character) : [];
  // Noisy armor slants Stealth on its own, whether or not the character is
  // trained for it. Both slants can fire for the same piece, so the log states
  // each reason separately below.
  const noisy =
    event.kind === 'check' && event.key === 'stealth' ? stealthPenalty(character) : null;
  /** @type {(import('../entities/ConditionEffects.js').Slant | null)[]} */
  const wearSlants = [];
  if (badWear.length > 0) wearSlants.push('disadvantage');
  if (noisy) wearSlants.push('disadvantage');
  // A null mode means nothing slanted the roll, and the key stays off the
  // selection so the tray's standing toggle still applies.
  const mode = rollMode(conditionQuery, wearSlants);
  const { result } = app.actions.rollDice({
    counts: { d20: 1 },
    modifier: bonus + rider.modifier,
    ...(mode ? { mode } : {}),
  });
  const d20 = result.results.find((r) => r.die === 'd20');
  const natural = d20?.rolls[0] ?? 0;
  const parts = [`${ability} ${formatModifier(abilityMod)}`];
  if (proficiency.word) parts.push(proficiency.word);
  if (rider.note) parts.push(rider.note);
  // Naming the chips keeps a cancelled pair readable: the line says why the
  // roll came out straight, not just that it did.
  const reasons = modeReasons(conditionQuery);
  if (reasons) parts.push(reasons);
  if (badWear.length > 0) {
    parts.push(`not proficient with ${badWear.join(' and ')}, disadvantage`);
  }
  if (noisy) parts.push(`wearing ${noisy}, disadvantage`);
  // An advantage or disadvantage roll names the discarded d20, matching the
  // tray's own readout. The tray injects its standing toggle when the caller
  // names no mode, so the note can appear without this module asking for it.
  const modeNote = droppedNote(d20, result.selection.mode);
  const naturalNote = natural === 1 || natural === 20 ? ` Natural ${natural}.` : '';
  app.actions.logEvent(
    'roll',
    `${character.name} rolls ${phrase} (${parts.join(', ')}): ${result.total}${modeNote}.${naturalNote}`,
  );
  app.toasts.show(`${character.name} rolls ${result.total} on ${phrase}.`);
}
