import { getHP } from './Character.js';
import { isDead } from './DeathSaves.js';
import { getHitDicePools, hitDieOfPool, spendHitDie } from './HitDice.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/entities.js').ResourcePool} ResourcePool */

/**
 * The hit dice spent during a short rest, as pure steps under the short
 * rest dialog. The dialog offers one count per hit-dice pool of each living
 * character, and `spendRestDice` rolls that many dice of the pool.
 *
 * Every function is pure apart from the random number generator it takes.
 */

/**
 * The hit-dice pools a character can spend in a rest: every pool with a die
 * left. A dead character spends nothing.
 * @param {Character} character
 * @returns {ResourcePool[]}
 */
export function spendablePools(character) {
  if (isDead(character)) return [];
  return getHitDicePools(character).filter((pool) => pool.current > 0);
}

/**
 * Spend up to `counts[poolId]` dice from each pool, one at a time. Spending
 * stops for the character once its HP reaches the maximum, because a
 * further die heals nothing and a long rest restores only half of the dice.
 * A count above the dice left spends what is left.
 * @param {Character} character
 * @param {Record<string, number>} counts
 * @param {() => number} [rng]
 * @returns {{ character: Character, rolls: number[], healed: number }}
 */
export function spendRestDice(character, counts, rng = Math.random) {
  let current = character;
  /** @type {number[]} */
  const rolls = [];
  let healed = 0;
  for (const pool of spendablePools(character)) {
    const wanted = Math.max(0, Math.floor(counts[pool.id] ?? 0));
    for (let i = 0; i < wanted; i++) {
      const hp = getHP(current);
      if (hp && hp.current >= hp.max) break;
      const result = spendHitDie(current, hitDieOfPool(pool), rng);
      if (result.character === current) break;
      current = result.character;
      rolls.push(result.rolled);
      healed += result.healed;
    }
  }
  return { character: current, rolls, healed };
}
