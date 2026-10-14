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

/**
 * Memoize a two-argument pure function on the identity of both arguments.
 * The cache is a WeakMap of WeakMaps, keyed first by `a` and then by `b`, so
 * an entry disappears with either object. The same rule applies as for
 * `memoizeByIdentity`: neither argument is ever mutated in place.
 * @template {object} A
 * @template {object} B
 * @template R
 * @param {(a: A, b: B) => R} compute
 * @returns {(a: A, b: B) => R}
 */
export function memoizeByIdentity2(compute) {
  /** @type {WeakMap<A, WeakMap<B, { value: R }>>} */
  const cache = new WeakMap();
  return (a, b) => {
    let inner = cache.get(a);
    if (!inner) {
      inner = new WeakMap();
      cache.set(a, inner);
    }
    let entry = inner.get(b);
    if (!entry) {
      entry = { value: compute(a, b) };
      inner.set(b, entry);
    }
    return entry.value;
  };
}
