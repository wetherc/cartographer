/**
 * Memoize a one-argument pure function on the identity of its argument. The
 * cache is a WeakMap. An entry disappears with the object it was keyed on, so
 * nothing needs manual removal.
 *
 * This function is safe only for arguments that are never mutated in place.
 * The entity layer follows this rule: every writer returns a new object, so a
 * returned object never changes. If you apply this to a value that something
 * else mutates, the cache serves a stale result forever.
 * @template {object} T
 * @template R
 * @param {(input: T) => R} compute
 * @returns {(input: T) => R}
 */
export function memoizeByIdentity(compute) {
  /** @type {WeakMap<T, { value: R }>} */
  const cache = new WeakMap();
  return (input) => {
    let entry = cache.get(input);
    if (!entry) {
      entry = { value: compute(input) };
      cache.set(input, entry);
    }
    return entry.value;
  };
}
