/**
 * Game time passing outside combat, for effects that count combat rounds.
 *
 * A round is six seconds, so an hour is 600 rounds and one watch of the
 * clock (a sixth of a day) is 2,400 rounds. When the clock advances, every
 * condition chip, every creature stat modifier, and every held
 * concentration with a round count loses that many rounds, and each one
 * that reaches zero ends. Without this step, Bless cast between fights still
 * reads 10 rounds after an 8-hour rest. A duration with no round count
 * (open-ended, or measured in days) is left alone. This module is pure.
 */

import { drop } from './Concentration.js';
import { CONCENTRATING, addCondition } from './Conditions.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/creature.js').Creature} Creature */
/** @typedef {import('../types/entities.js').Condition} Condition */

/** Combat rounds in one hour. */
export const ROUNDS_PER_HOUR = 600;

/** Combat rounds in one watch of the game clock, which is four hours. */
export const ROUNDS_PER_WATCH = 4 * ROUNDS_PER_HOUR;

/**
 * The list with `rounds` taken off every timed entry, and each entry that
 * reaches zero removed. The same list comes back when nothing in it is
 * timed, so an unchanged entity keeps its identity.
 * @template {{ rounds: number | null }} T
 * @param {T[]} list
 * @param {number} rounds
 * @returns {T[]}
 */
function elapseList(list, rounds) {
  if (!list.some((entry) => entry.rounds !== null)) return list;
  return list
    .map((entry) => (entry.rounds === null ? entry : { ...entry, rounds: entry.rounds - rounds }))
    .filter((entry) => entry.rounds === null || entry.rounds > 0);
}

/**
 * A character after `rounds` of game time. `ended` names the concentration
 * spell that ran out, so the caller can end what that spell holds on other
 * entities. Concentration elapses after the conditions and rewrites its own
 * chip from the duration it keeps, as the combat round tick does.
 * @param {Character} character
 * @param {number} rounds
 * @returns {{ character: Character, ended: import('../types/entities.js').ConcentrationState | null }}
 */
export function elapseCharacter(character, rounds) {
  const conditions = elapseList(character.conditions, rounds);
  const next = conditions === character.conditions ? character : { ...character, conditions };
  const held = next.concentration;
  if (!held || held.remaining === null) return { character: next, ended: null };
  const remaining = held.remaining - rounds;
  if (remaining <= 0) return { character: drop(next), ended: held };
  return {
    character: {
      ...next,
      concentration: { ...held, remaining },
      conditions: addCondition(next.conditions, CONCENTRATING, remaining),
    },
    ended: null,
  };
}

/**
 * A creature after `rounds` of game time: its conditions and its timed stat
 * modifiers lose the rounds. A creature with nothing timed comes back as the
 * same object.
 * @param {Creature} creature
 * @param {number} rounds
 * @returns {Creature}
 */
export function elapseCreature(creature, rounds) {
  const conditions = elapseList(creature.conditions, rounds);
  const statMods = creature.statMods ? elapseList(creature.statMods, rounds) : undefined;
  if (conditions === creature.conditions && statMods === creature.statMods) return creature;
  return { ...creature, conditions, ...(statMods ? { statMods } : {}) };
}
