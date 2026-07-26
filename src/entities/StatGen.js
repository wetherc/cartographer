/**
 * Ability-score generation methods for character creation: the 5e point-buy
 * cost table, the standard array with a swap-repair helper for editing it in
 * place, and the 4d6-drop-lowest roller. All pure; the roller takes its RNG as
 * an argument.
 */

export const POINT_BUY_BUDGET = 27;

/** Point cost per score under 5e point buy; scores outside 8-15 are not buyable. */
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
 * Whether the scores use each standard-array value exactly once.
 * @param {Record<string, number>} scores
 * @returns {boolean}
 */
export function isStandardArray(scores) {
  const sorted = Object.values(scores).sort((a, b) => b - a);
  return sorted.length === STANDARD_ARRAY.length && sorted.every((v, i) => v === STANDARD_ARRAY[i]);
}

/**
 * Repair a standard-array assignment after one score was edited, by swapping:
 * when the new value is an array value now held twice, the other holder takes
 * the value that went missing. Any other state (a non-array value, or more
 * than one discrepancy) is returned unchanged, so a half-typed number is never
 * overwritten under the user.
 * @param {Record<string, number>} scores
 * @param {string} changedKey
 * @returns {Record<string, number>}
 */
export function repairStandardArray(scores, changedKey) {
  const value = scores[changedKey];
  if (!STANDARD_ARRAY.includes(value)) return scores;
  const other = Object.keys(scores).find((k) => k !== changedKey && scores[k] === value);
  if (!other) return scores;
  const remaining = [...STANDARD_ARRAY];
  for (const v of Object.values(scores)) {
    const at = remaining.indexOf(v);
    if (at !== -1) remaining.splice(at, 1);
  }
  if (remaining.length !== 1) return scores;
  return { ...scores, [other]: remaining[0] };
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
