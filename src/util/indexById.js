/**
 * Build a Map from a collection keyed by id. Repeated lookups by id become
 * O(1) instead of a linear scan with `.find`.
 * This function is pure. When ids collide, the later id wins, the same
 * behavior as the array scan it replaces.
 * @template {{ id: string }} T
 * @param {readonly T[]} items
 * @returns {Map<string, T>}
 */
export function indexById(items) {
  const map = new Map();
  for (const item of items) map.set(item.id, item);
  return map;
}

/**
 * Build a Map keyed by a derived key instead of a fixed `id` field. Use this
 * for collections keyed on something other than `id`, for example names.
 * This function is pure. When keys collide, the later entry wins.
 * @template T
 * @param {readonly T[]} items
 * @param {(item: T) => string} keyOf
 * @returns {Map<string, T>}
 */
export function indexBy(items, keyOf) {
  const map = new Map();
  for (const item of items) map.set(keyOf(item), item);
  return map;
}
