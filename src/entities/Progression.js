import { syncSlotsToLevel } from './SpellSlots.js';
import { syncHitDice, reconcileMaxHP } from './HitDice.js';
import { withClasses as setClassList } from './Multiclass.js';
import { withRace as setRace, withCustomRace as setCustomRace } from './Races.js';
import {
  withProficiencies as setProficiencies,
  withExpertise as setExpertise,
} from './Proficiencies.js';
import {
  applyASI as recordASI,
  takeFeat as recordFeat,
  undoLastChoice as dropLastChoice,
} from './LevelUp.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/class.js').ClassRef} ClassRef */
/** @typedef {import('../types/entities.js').Proficiencies} Proficiencies */

/**
 * This is the one place that reconciles a character's derived state.
 *
 * Spell slots, hit dice, and maximum HP are all functions of the class list,
 * the character level, the ability scores, and the class catalog. Nothing
 * recomputes them on read. The app stores them as resource pools, so every
 * write that can change an input must re-derive them, or the pools drift and
 * stay drifted. `derive` is that step. The writers exported below are the
 * same writers that the lower modules expose, with the step already
 * attached. Use these writers from app and UI code. The raw versions in
 * `Multiclass.js`, `Races.js`, `Proficiencies.js`, and `LevelUp.js` exist so
 * those modules can stay pure list arithmetic below the class catalog.
 * Calling them directly skips the reconcile.
 */

/**
 * Reconcile every derived pool against the character's current class list,
 * level, and ability scores. The function reconciles spell-slot maxima, then
 * hit-dice pools, then the HP pool's maximum. Order matters. The HP
 * reconcile reads the class list that the other two also read, and running
 * it last keeps the resource ordering that the slot and hit-dice syncs
 * establish. Spending is preserved throughout, so a pool that grows keeps
 * what was spent out of it. A character whose derived state already matches
 * returns unchanged, with identity preserved.
 * @param {Character} character
 * @returns {Character}
 */
export function derive(character) {
  return reconcileMaxHP(syncHitDice(syncSlotsToLevel(character)));
}

/**
 * Wrap a writer so it re-derives, unless the writer itself was a no-op. The
 * lower modules return the same reference when nothing changed, and callers,
 * including tests, rely on that behavior.
 * @template {unknown[]} A
 * @param {(character: Character, ...args: A) => Character} write
 * @returns {(character: Character, ...args: A) => Character}
 */
function deriving(write) {
  return (character, ...args) => {
    const next = write(character, ...args);
    return next === character ? character : derive(next);
  };
}

/** Set the class list, then re-derive. See Multiclass.withClasses.
 * @type {(character: Character, classes: ClassRef[]) => Character} */
export const withClasses = deriving(setClassList);

/** Assign a catalog race, then re-derive. A CON increase from the race moves HP.
 * See Races.withRace.
 * @type {(character: Character, raceId: string) => Character} */
export const withRace = deriving(setRace);

/** Set a hand-typed race, then re-derive (dropping a catalog race drops its
 * ability increases with it). See Races.withCustomRace.
 * @type {(character: Character, name: string) => Character} */
export const withCustomRace = deriving(setCustomRace);

/** Set the proficiency lists, then re-derive. See Proficiencies.withProficiencies.
 * @type {(character: Character, proficiencies: Partial<Proficiencies>) => Character} */
export const withProficiencies = deriving(setProficiencies);

/** Set the expertise skills, then re-derive. See Proficiencies.withExpertise.
 * @type {(character: Character, skillIds: string[]) => Character} */
export const withExpertise = deriving(setExpertise);

/** Spend the first pending ASI slot on an ability increase, then re-derive.
 * This step grants the retroactive HP that a CON increase is worth. See
 * LevelUp.applyASI.
 * @type {(character: Character, increases: Record<string, number>) => Character} */
export const applyASI = deriving(recordASI);

/** Spend the first pending ASI slot on a feat, then re-derive. A half-feat's
 * CON increase grants retroactive HP the same way an ASI does. See
 * LevelUp.takeFeat.
 * @type {(character: Character, feat: string | import('../types/feat.js').FeatStamp) => Character} */
export const takeFeat = deriving(recordFeat);

/** Undo the most recent ASI choice, then re-derive (an undone CON increase
 * takes its HP back). See LevelUp.undoLastChoice.
 * @type {(character: Character) => Character} */
export const undoLastChoice = deriving(dropLastChoice);

/**
 * Set one ability score, then re-derive. This function lives here instead of
 * in Character.js, because the reconcile that it needs reads the class
 * catalog, and Character.js sits below that catalog.
 * @param {Character} character
 * @param {string} key
 * @param {number} value
 * @returns {Character}
 */
export function setStat(character, key, value) {
  return derive({ ...character, stats: { ...character.stats, [key]: value } });
}
