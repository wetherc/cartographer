/**
 * Map a list, and return the same list when every element maps to itself.
 * Caches keyed on the array, such as the roster indexes, then stay valid, and
 * a caller can test `result === list` to skip a write.
 * This function is pure.
 * @template T
 * @param {readonly T[]} list
 * @param {(item: T, index: number) => T} fn
 * @returns {T[]}
 */
export function mapKeep(list, fn) {
  const next = list.map(fn);
  return next.some((item, i) => item !== list[i]) ? next : /** @type {T[]} */ (list);
}
