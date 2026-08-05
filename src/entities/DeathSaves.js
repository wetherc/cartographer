/**
 * Death saves: what happens to a party character between 0 HP and dead.
 * Every function is pure. Each function takes a character and returns a new
 * one, and the d20 for a death save comes from the injected random number
 * generator.
 *
 * A dying character holds `character.deathSaves`. Null means the character is
 * not dying. The `Unconscious` chip beside it is what the rest of the app
 * reads for the mechanical effects of being down, so the writers here put it
 * on and take it off. No caller must remember both halves.
 *
 * Three successes stabilize. Three failures kill. A stable character stays at
 * 0 HP and unconscious, and rolls no more saves until something damages it
 * again.
 */

import { UNCONSCIOUS, addCondition, removeCondition } from './Conditions.js';
import { resolveSave } from './Checks.js';
import { d20Penalty } from './Exhaustion.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/entities.js').DeathSaveState} DeathSaveState */
/** @typedef {import('../types/dice.js').RollMode} RollMode */
/** @typedef {import('../types/dice.js').RandomFn} RandomFn */

/** The fixed DC of a death save. */
export const DEATH_SAVE_DC = 10;

/** How many successes stabilize, and how many failures kill. */
export const DEATH_SAVE_LIMIT = 3;

/**
 * @param {Character} character
 * @returns {boolean} whether this character is at 0 HP and still rolling.
 */
export function isDying(character) {
  const state = character.deathSaves;
  if (!state) return false;
  return !state.stable && state.failures < DEATH_SAVE_LIMIT;
}

/**
 * @param {Character} character
 * @returns {boolean} whether this character is at 0 HP and out of danger.
 */
export function isStable(character) {
  return Boolean(character.deathSaves?.stable);
}

/**
 * @param {Character} character
 * @returns {boolean} whether this character failed three death saves.
 */
export function isDead(character) {
  return (character.deathSaves?.failures ?? 0) >= DEATH_SAVE_LIMIT;
}

/**
 * Start the tracker on the hit that drops a character to 0 HP. The hit itself
 * costs no failure. The character goes unconscious, which is what gives an
 * attacker advantage and a melee hit an automatic crit through
 * `ConditionEffects`.
 *
 * A character that already holds a tracker keeps it. Damage on a downed
 * character goes through {@link recordDamage} instead, and calling this twice
 * would throw away the failures already rolled.
 * @param {Character} character
 * @returns {Character}
 */
export function dropToDying(character) {
  if (character.deathSaves) return character;
  return {
    ...character,
    deathSaves: { successes: 0, failures: 0, stable: false },
    conditions: addCondition(character.conditions, UNCONSCIOUS),
  };
}

/**
 * Take the tracker and the chip off, which is what a heal above 0 HP and a
 * natural 20 both do. A character that holds no tracker comes back unchanged.
 * @param {Character} character
 * @returns {Character}
 */
export function clearDying(character) {
  if (!character.deathSaves) return character;
  return {
    ...character,
    deathSaves: null,
    conditions: removeCondition(character.conditions, UNCONSCIOUS),
  };
}

/**
 * Stabilize by hand, which is what a successful Medicine check or a healer's
 * kit does. The counters reset, because a stable character that takes damage
 * starts its saves over. The character stays at 0 HP and stays unconscious.
 * A dead character cannot be stabilized.
 * @param {Character} character
 * @returns {Character}
 */
export function stabilize(character) {
  if (!character.deathSaves || isDead(character)) return character;
  return { ...character, deathSaves: { successes: 0, failures: 0, stable: true } };
}

/**
 * The outcome of one death save.
 * - `revive`: a natural 20, so the character wakes at 1 HP.
 * - `stable`: the third success.
 * - `dead`: the third failure.
 * - `success` and `failure`: a counter moved and the character keeps rolling.
 * @typedef {'revive' | 'success' | 'failure' | 'stable' | 'dead'} DeathSaveOutcome
 */

/**
 * The one judge behind both roll paths. It maps a rolled d20 to the next
 * tracker state, so the UI path and the entity path cannot drift apart.
 *
 * A natural 20 revives the character outright, whatever the counters hold. A
 * natural 1 counts as two failures, and it fails even when riders push the
 * total past the DC. Otherwise the total beats the DC on a tie, as every other
 * save in the app does.
 *
 * A revive reports a null state, which is the cleared tracker. The caller
 * writes that through {@link clearDying}, so the chip comes off with it.
 * @param {DeathSaveState} state the tracker before the roll
 * @param {{ natural: number, total: number, dc?: number }} roll
 * @returns {{ state: DeathSaveState | null, outcome: DeathSaveOutcome }}
 */
export function judgeDeathSave(state, { natural, total, dc = DEATH_SAVE_DC }) {
  if (natural === 20) return { state: null, outcome: 'revive' };
  if (natural === 1) return countFailures(state, 2);
  if (total >= dc) {
    const successes = state.successes + 1;
    if (successes >= DEATH_SAVE_LIMIT) {
      return { state: { successes: 0, failures: 0, stable: true }, outcome: 'stable' };
    }
    return { state: { ...state, successes }, outcome: 'success' };
  }
  return countFailures(state, 1);
}

/**
 * Add failures to the tracker and report whether they killed the character. A
 * stable character that fails is dying again, so the flag comes off. Failures
 * past the third are not clamped: the state is kept so that a readout can say
 * how the character went down.
 * @param {DeathSaveState} state
 * @param {number} count
 * @returns {{ state: DeathSaveState, outcome: DeathSaveOutcome }}
 */
function countFailures(state, count) {
  const failures = state.failures + count;
  const next = { ...state, failures, stable: false };
  return { state: next, outcome: failures >= DEATH_SAVE_LIMIT ? 'dead' : 'failure' };
}

/**
 * What a character adds to a death save. A death save takes no ability
 * modifier and no proficiency, so exhaustion is the whole of it and the value
 * is zero or negative.
 *
 * Both death-save paths read this one function. The headless
 * {@link rollDeathSave} below hands it to `resolveSave`, and `app/deathSaves.js`
 * hands it to the dice tray. Neither can drift from the other.
 * @param {Character} character
 * @returns {number}
 */
export function deathSaveBonus(character) {
  return d20Penalty(character);
}

/**
 * Roll one death save for a character and apply the outcome. This is the
 * headless path, for tests and for callers with no dice tray. The UI path
 * rolls through the tray and calls {@link judgeDeathSave} with the same
 * numbers.
 *
 * The save goes through `Checks.resolveSave` with {@link deathSaveBonus},
 * which is 0 for a rested character and the exhaustion penalty for a tired
 * one. Going through that function is what lets a rider such as Bless join the
 * roll. No ability key is passed, so the automatic failure that unconsciousness
 * imposes on Strength and Dexterity saves does not catch a death save.
 *
 * A character who is not dying rolls nothing, which covers a stable character
 * and a dead one.
 * @param {Character} character
 * @param {{ mode?: RollMode, rng?: RandomFn }} [opts]
 * @returns {{
 *   character: Character,
 *   save: import('./Checks.js').SaveResult | null,
 *   outcome: DeathSaveOutcome | null,
 * }}
 */
export function rollDeathSave(character, opts = {}) {
  const state = character.deathSaves;
  if (!state || !isDying(character)) return { character, save: null, outcome: null };
  const save = resolveSave(deathSaveBonus(character), DEATH_SAVE_DC, {
    conditions: character.conditions ?? [],
    ...opts,
  });
  const judged = judgeDeathSave(state, save);
  return { character: applyJudged(character, judged.state), save, outcome: judged.outcome };
}

/**
 * Write a judged tracker back to the character. A null state is a revive, so
 * it goes through `clearDying` and takes the chip with it.
 * @param {Character} character
 * @param {DeathSaveState | null} state
 * @returns {Character}
 */
export function applyJudged(character, state) {
  return state === null ? clearDying(character) : { ...character, deathSaves: state };
}

/**
 * Damage on a character who is already at 0 HP. There is no roll: the hit is
 * an automatic failure, and a critical hit counts as two. A stable character
 * that takes damage is dying again, with that same failure against it.
 *
 * A character who is not at 0 HP, or who is already dead, comes back
 * unchanged with no failures reported.
 * @param {Character} character
 * @param {{ crit?: boolean }} [opts]
 * @returns {{ character: Character, failures: number, dead: boolean }}
 */
export function recordDamage(character, { crit = false } = {}) {
  const state = character.deathSaves;
  if (!state || isDead(character)) return { character, failures: 0, dead: false };
  const count = crit ? 2 : 1;
  const judged = countFailures(state, count);
  return {
    character: { ...character, deathSaves: judged.state },
    failures: count,
    dead: judged.outcome === 'dead',
  };
}
