/**
 * Pure rules for Legendary Resistance. A creature with this trait can turn a
 * failed saving throw into a success a set number of times each day. The
 * creature keeps the count of uses it spent in `legendaryResistanceUsed`, and
 * a long rest gives them all back.
 */
import { coerceLegendary } from '../entities/CreatureAttacks.js';

/** @typedef {import('../types/creature.js').Creature} Creature */

/**
 * How many uses of Legendary Resistance the creature has left today.
 * @param {Pick<Creature, 'legendaryResistance' | 'legendaryResistanceUsed'>} creature
 * @returns {number}
 */
export function resistancesLeft(creature) {
  const max = coerceLegendary(creature.legendaryResistance) ?? 0;
  const used = Math.floor(Number(creature.legendaryResistanceUsed));
  return Math.max(0, max - (Number.isFinite(used) && used > 0 ? used : 0));
}

/**
 * Spend one use. A creature with none left returns unchanged.
 * @template {Pick<Creature, 'legendaryResistance' | 'legendaryResistanceUsed'>} T
 * @param {T} creature
 * @returns {T}
 */
export function spendResistance(creature) {
  const left = resistancesLeft(creature);
  if (left <= 0) return creature;
  const max = coerceLegendary(creature.legendaryResistance) ?? 0;
  return { ...creature, legendaryResistanceUsed: max - left + 1 };
}

/**
 * Give back every use, for a long rest. A creature that spent none returns
 * unchanged, so a long rest does not replace every creature object.
 * @template {{ legendaryResistanceUsed?: number }} T
 * @param {T} creature
 * @returns {T}
 */
export function restoreResistance(creature) {
  if (creature.legendaryResistanceUsed === undefined) return creature;
  const { legendaryResistanceUsed: _, ...rest } = creature;
  return /** @type {T} */ (rest);
}

/**
 * Give back every use of every creature, for a long rest. The list returns
 * unchanged when no creature spent a use, so the rest does not replace the
 * creature list and repaint every panel that reads it.
 * @template {{ legendaryResistanceUsed?: number }} T
 * @param {T[]} creatures
 * @returns {T[]}
 */
export function restoreAllResistance(creatures) {
  const rested = creatures.map(restoreResistance);
  return rested.some((c, i) => c !== creatures[i]) ? rested : creatures;
}

/**
 * Whether a save outcome of a spell is a failed saving throw that Legendary
 * Resistance can turn. A target that the spell left alone, or that a spell
 * with no save reached (an HP pool such as Sleep), rolled no save to turn.
 * @param {any} outcome
 * @returns {boolean}
 */
export function canResist(outcome) {
  return outcome.saved === false && !outcome.unaffectedBy && !outcome.noRoll;
}

/**
 * The outcome of a failed save turned into a success. The target takes half
 * damage on a spell that halves on a save and none otherwise, and no
 * condition or later-turn damage lands.
 * @param {{ halfOnSave?: boolean }} effect the spell's save effect
 * @param {any} outcome
 * @returns {any}
 */
export function resistedOutcome(effect, outcome) {
  const { ongoing: _, ...rest } = outcome;
  const total = outcome.damage?.total ?? 0;
  return {
    ...rest,
    saved: true,
    taken: effect.halfOnSave ? Math.floor(total / 2) : 0,
    condition: null,
    conditionRider: null,
    resisted: true,
  };
}
