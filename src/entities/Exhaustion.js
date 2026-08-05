/**
 * Exhaustion, in the 2024 form: one rule that scales with the level rather
 * than a table of six different penalties. Each level costs 2 on every d20
 * test and 5 feet of speed, and the sixth level kills.
 *
 * The level is one stored number on the character or the creature. Nothing
 * else is stored. The penalty, the speed cut, and the readout all derive from
 * it here, so no write site can bake a stale value into a save.
 *
 * The penalty reaches a roll through the bonus, not through a condition chip
 * with a rider on it. A rider only shows up once dice are thrown, and the
 * sheet prints its saving-throw and skill bonuses without throwing any. A chip
 * would leave the sheet reading +5 where the roll produced -1. Folding the
 * penalty into `Checks.saveBonus` and `Checks.checkBonus` instead means the
 * printed number and the rolled number cannot disagree, and it carries the
 * penalty into a passive score for free.
 *
 * Every function here is pure, and this module imports nothing but the
 * condition list. That is deliberate: `Checks.js` reads it, and `Checks.js` is
 * what `DeathSaves.js` is built on, so any import of those from here would
 * close a cycle. The two rules that need to know about death, the guard that
 * keeps a long rest from easing a dead character and the revive that has to
 * bring a level-6 character back below six, therefore live with their callers.
 */

import { removeCondition } from './Conditions.js';

/** @typedef {import('../types/entities.js').Condition} Condition */

/**
 * Anything that carries an exhaustion level. Both `Character` and `Creature`
 * do, and nothing here needs any other field of either.
 * @typedef {{ exhaustion?: number }} Exhaustible
 */

/** The level that kills. There is no seventh. */
export const MAX_EXHAUSTION = 6;

/** What one level takes off every d20 test. */
export const PENALTY_PER_LEVEL = 2;

/** What one level takes off the walking speed, in feet. */
export const SPEED_PER_LEVEL = 5;

/**
 * The name exhaustion went by while it was a hand-added condition chip, before
 * it had a level behind it. `exhaustionFields` folds such a chip into level 1
 * and drops it, and the name is gone from the `CONDITIONS` pick-list, so there
 * is only ever one way to say a character is exhausted.
 */
export const LEGACY_CHIP = 'Exhaustion';

/**
 * The stored level, read tolerantly: a whole number from 0 to
 * {@link MAX_EXHAUSTION}. An absent, negative, fractional, or over-large value
 * comes back inside the range, so a hand-edited save cannot push a character
 * past death or below rest.
 * @param {Exhaustible} entity
 * @returns {number}
 */
export function exhaustionLevel(entity) {
  const stored = Math.floor(Number(entity.exhaustion));
  if (!Number.isFinite(stored) || stored < 0) return 0;
  return Math.min(stored, MAX_EXHAUSTION);
}

/**
 * What exhaustion adds to a d20 test: zero, or a negative number. It is signed
 * so that a caller adds it to a bonus rather than remembering to subtract it.
 * @param {Exhaustible} entity
 * @returns {number}
 */
export function d20Penalty(entity) {
  const level = exhaustionLevel(entity);
  // Multiplying zero by the negative rate gives -0, which formats as "-0" in a
  // badge. Returning the level's own zero keeps the readout clean.
  return level ? -PENALTY_PER_LEVEL * level : 0;
}

/**
 * What exhaustion takes off the walking speed, in feet, as a positive number.
 * `Movement.walkSpeed` subtracts it and floors the result at zero, so a slow
 * race at a high level stops rather than walking backwards.
 * @param {Exhaustible} entity
 * @returns {number}
 */
export function speedPenalty(entity) {
  return SPEED_PER_LEVEL * exhaustionLevel(entity);
}

/**
 * Whether this level of exhaustion is the fatal one. The death itself is not
 * written here. A character dies by its death-save tracker and a creature dies
 * at 0 HP, and neither of those is this module's to reach.
 * @param {Exhaustible} entity
 * @returns {boolean}
 */
export function atDeathLevel(entity) {
  return exhaustionLevel(entity) >= MAX_EXHAUSTION;
}

/**
 * Set the level outright, clamped. This is what the GM's stepper calls.
 * @template {Exhaustible} T
 * @param {T} entity
 * @param {number} level
 * @returns {T}
 */
export function setExhaustion(entity, level) {
  return { ...entity, exhaustion: exhaustionLevel({ exhaustion: level }) };
}

/**
 * Add levels, clamped at death. This is what a failed save against an effect
 * that exhausts its target calls.
 * @template {Exhaustible} T
 * @param {T} entity
 * @param {number} [count]
 * @returns {T}
 */
export function gainExhaustion(entity, count = 1) {
  return setExhaustion(entity, exhaustionLevel(entity) + Math.max(0, Math.floor(count)));
}

/**
 * Take levels off, clamped at zero. A long rest eases one level.
 *
 * There is no death guard here. A dead character must not ease back toward
 * life, but this module cannot read a death-save tracker without closing an
 * import cycle, so the caller holds that guard. `Character.longRest` is the
 * one caller that needs it, because the Time panel rests the whole party at
 * once and does not check who is still alive.
 * @template {Exhaustible} T
 * @param {T} entity
 * @param {number} [count]
 * @returns {T}
 */
export function easeExhaustion(entity, count = 1) {
  return setExhaustion(entity, exhaustionLevel(entity) - Math.max(0, Math.floor(count)));
}

/**
 * A sentence for the badge and the log, saying what the current level costs.
 * @param {Exhaustible} entity
 * @returns {string}
 */
export function exhaustionNote(entity) {
  const level = exhaustionLevel(entity);
  if (!level) return 'No exhaustion.';
  if (level >= MAX_EXHAUSTION) return `Exhaustion ${level}: dead.`;
  return (
    `Exhaustion ${level}: ${d20Penalty({ exhaustion: level })} to every d20 test, ` +
    `and ${speedPenalty({ exhaustion: level })} feet slower.`
  );
}

/**
 * The exhaustion half of a loaded character or creature, for the `withDefaults`
 * of each. It returns both fields it touches, because folding a legacy chip
 * changes the condition list as well as the level.
 *
 * A save written while exhaustion was a chip carried no level. Such a chip
 * reads as level 1, which is the least the GM can have meant by adding it, and
 * the chip comes off. A save that already stores a level keeps it and drops any
 * stray chip beside it, so the two can never disagree.
 * @param {number | undefined} stored the level as the save holds it
 * @param {Condition[]} conditions the condition list, already defaulted
 * @returns {{ exhaustion: number, conditions: Condition[] }}
 */
export function exhaustionFields(stored, conditions) {
  const chipped = conditions.some((c) => c.name.toLowerCase() === LEGACY_CHIP.toLowerCase());
  const level = exhaustionLevel({ exhaustion: stored });
  return {
    exhaustion: level || (chipped ? 1 : 0),
    conditions: chipped ? removeCondition(conditions, LEGACY_CHIP) : conditions,
  };
}
