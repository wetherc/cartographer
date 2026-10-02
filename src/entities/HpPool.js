/**
 * The HP pool of a spell such as Sleep or Color Spray. The cast rolls a pool
 * of hit points and walks its targets in order of current HP, lowest first.
 * Each target whose HP fits in what the pool has left takes the effect and
 * takes its HP out of the pool. `Casting.js` rolls the pool here and then
 * resolves each target from the walk. Every function here is pure, and the
 * roll takes its random source as an argument.
 */

import { roll } from '../dice/DiceRoller.js';

/** @typedef {import('../types/spell.js').SpellHpPool} SpellHpPool */
/** @typedef {import('../types/dice.js').DieType} DieType */
/** @typedef {import('../types/dice.js').RandomFn} RandomFn */
/** @typedef {import('./Casting.js').CastTarget} CastTarget */

/** The chip that puts a creature out of reach of every HP pool. */
const UNCONSCIOUS = 'unconscious';

/**
 * Roll a pool's dice, with the dice that the cast's scaling adds.
 * @param {SpellHpPool} pool
 * @param {number} steps the cast's scaling increments
 * @param {RandomFn} rng
 * @returns {{ total: number, rolls: number[], dice: string }}
 */
export function rollHpPool(pool, steps, rng) {
  const count = pool.count + (pool.perStep ?? 0) * steps;
  const die = /** @type {DieType} */ (`d${pool.sides}`);
  const result = roll({ counts: { [die]: count }, modifier: 0 }, rng);
  return { total: result.total, rolls: result.results[0]?.rolls ?? [], dice: `${count}${die}` };
}

/**
 * Walk a rolled pool over the targets. The result lists every target in pool
 * order: current HP ascending, with ties in the order the caster picked them.
 * `affected` says whether the target takes the effect, and `reason` says why,
 * for the log.
 *
 * A target at 0 HP, an Unconscious one, and one that already holds the
 * spell's condition take nothing and spend nothing, because Sleep and Color
 * Spray both pass over such creatures. A target whose HP the app cannot read
 * takes the effect without spending the pool, the same way an HP limit lets
 * it through, so the GM can still apply the spell. Such targets come last.
 *
 * Each reason goes on a GM-only log line, and a Player tab reads that line
 * without the reason (see `combat/SaveLines.js`), because the order of the
 * walk and the pool total bound each target's HP.
 * @param {CastTarget[]} targets
 * @param {number} total
 * @param {string | undefined} condition the condition the spell imposes
 * @returns {{ target: CastTarget, affected: boolean, reason: string }[]}
 */
export function walkHpPool(targets, total, condition) {
  const held = (/** @type {CastTarget} */ target, /** @type {string} */ name) =>
    (target.conditions ?? []).some((c) => c.name.toLowerCase() === name.toLowerCase());
  const ranked = [...targets].sort(
    (a, b) => (a.hp ?? Number.POSITIVE_INFINITY) - (b.hp ?? Number.POSITIVE_INFINITY),
  );
  let left = total;
  return ranked.map((target) => {
    if (target.hp === undefined) return { target, affected: true, reason: 'HP unknown' };
    if (target.hp <= 0) return { target, affected: false, reason: 'at 0 HP' };
    if (held(target, UNCONSCIOUS))
      return { target, affected: false, reason: 'already Unconscious' };
    if (condition && held(target, condition)) {
      return { target, affected: false, reason: `already ${condition}` };
    }
    if (target.hp > left) return { target, affected: false, reason: 'the pool runs out' };
    left -= target.hp;
    return { target, affected: true, reason: 'within the pool' };
  });
}
