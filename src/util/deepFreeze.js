/**
 * Recursively freeze a value and everything reachable from it, returning the
 * same value. Used on the built-in catalogs (equipment, bestiary, NPC
 * templates, spells), which are module constants handed out by reference and
 * merged into the library's memoized lists: every consumer is expected to treat
 * them as read-only, and a path that instead writes one into campaign state has
 * to copy it. Freezing turns a missed copy into a throw at the write rather
 * than a shared object two campaign entities silently edit through each other.
 * Pure apart from the freezing itself; cycles are handled.
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
