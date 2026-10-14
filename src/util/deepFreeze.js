/**
 * Freeze a value and everything reachable from it. Return the same value.
 * The built-in catalogs (equipment, bestiary, NPC templates, spells) use this
 * function. These catalogs are module constants that the library shares by
 * reference and merges into its memoized lists.
 * Every consumer must treat these catalogs as read-only. A path that writes
 * one into campaign state must copy it first.
 * Freezing turns a missed copy into an error at the write. Without freezing,
 * two campaign entities can edit one shared object through each other.
 * This function is pure except for the freeze itself. It handles cycles.
 * @template T
 * @param {T} value
 * @param {WeakSet<object>} [seen]
 * @returns {T}
 */
export function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object') return value;
  const obj = /** @type {object} */ (/** @type {unknown} */ (value));
  if (seen.has(obj)) return value;
  seen.add(obj);
  for (const key of Object.getOwnPropertyNames(obj)) {
    deepFreeze(/** @type {Record<string, unknown>} */ (obj)[key], seen);
  }
  return Object.freeze(value);
}
