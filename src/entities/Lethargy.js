import { createCondition } from './Conditions.js';

/**
 * The lethargy that Haste leaves when it ends. In 5e the target then can't
 * move or take actions until after its next turn. The app models it as a
 * Lethargic chip that ends at the end of the target's next turn, and the
 * turn pointer steps past a combatant that holds it (see
 * `ConditionEffects.losesTurn`).
 *
 * A chip ends by many paths: a turn boundary, a round tick, the end of the
 * caster's concentration, a replacement cast, or a hand edit. Every one of
 * them compares the chip list before and after with {@link endedEffects}, so
 * the rule lives here once. Every function here is pure.
 */

/** @typedef {import('../types/entities.js').Condition} Condition */
/** @typedef {import('../types/entities.js').ChipExpiry} ChipExpiry */

/** The name of the chip that lethargy leaves. */
export const LETHARGIC = 'Lethargic';

/**
 * The key that tells one chip from another across a write: its name and the
 * cast that wrote it. A chip that only counts down keeps its key, so it does
 * not read as ended.
 * @param {Condition} chip
 * @returns {string}
 */
const keyOf = (chip) =>
  [chip.name.toLowerCase(), chip.source?.spellId ?? '', chip.source?.casterId ?? ''].join('|');

/**
 * The chips of `prev` that `next` no longer has. A chip replaced by one of
 * the same name from another cast counts as ended, because the spell behind
 * it ended.
 * @param {Condition[]} prev
 * @param {Condition[]} next
 * @returns {Condition[]}
 */
export function endedEffects(prev, next) {
  if (prev === next) return [];
  const kept = new Set(next.map(keyOf));
  return prev.filter((chip) => !kept.has(keyOf(chip)));
}

/**
 * The list `next` with a Lethargic chip added when a chip that gave an
 * extra action (Haste) ended between `prev` and `next`. A list that already
 * has the chip, or in which no such chip ended, comes back as the same array.
 * @param {Condition[]} prev
 * @param {Condition[]} next
 * @param {{ rounds: number | null, expires?: ChipExpiry }} timing when the
 *   chip ends, from `TurnEffects.chipTiming` with the target-end boundary
 * @returns {Condition[]}
 */
export function withLethargy(prev, next, timing) {
  if (!endedEffects(prev, next).some((chip) => chip.mods?.extraAction)) return next;
  if (next.some((chip) => chip.name.toLowerCase() === LETHARGIC.toLowerCase())) return next;
  const extras = timing.expires ? { expires: timing.expires } : {};
  return [...next, createCondition(LETHARGIC, timing.rounds, extras)];
}
