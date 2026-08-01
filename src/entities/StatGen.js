/**
 * This module holds ability score generation methods for character
 * creation: the 5e point-buy cost table, the standard array, and the
 * 4d6-drop-lowest roller. Every function is pure. The roller takes its
 * random number generator as an argument.
 */

export const POINT_BUY_BUDGET = 27;

/** Point cost per score under 5e point buy. Scores outside the 8-15 range are not buyable. */
export const POINT_BUY_COSTS = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };

export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];

/**
 * Points left in the budget for the given scores, negative when over-spent,
 * or null when any score sits outside the buyable 8-15 range.
 * @param {Record<string, number>} scores
 * @returns {number | null}
 */
export function pointBuyRemaining(scores) {
  let spent = 0;
  for (const value of Object.values(scores)) {
    const cost = POINT_BUY_COSTS[/** @type {8} */ (value)];
    if (cost === undefined) return null;
    spent += cost;
  }
  return POINT_BUY_BUDGET - spent;
}

/**
 * One rolled ability score: 4d6, drop the lowest.
 * @param {() => number} rng
 * @returns {number}
 */
export function rollAbility(rng) {
  const dice = [0, 0, 0, 0].map(() => Math.floor(rng() * 6) + 1);
  return dice.reduce((a, b) => a + b, 0) - Math.min(...dice);
}

/**
 * A full rolled stat block, one 4d6-drop-lowest score per key.
 * @param {string[]} keys
 * @param {() => number} rng
 * @returns {Record<string, number>}
 */
export function rollScores(keys, rng) {
  return Object.fromEntries(keys.map((key) => [key, rollAbility(rng)]));
}
