/**
 * Memoize a one-argument pure function on the identity of its argument. The
 * cache is a WeakMap, so an entry disappears with the object it was keyed on
 * and nothing has to be invalidated by hand.
 *
 * Only safe for arguments that are never mutated in place, which is the rule
 * the entity layer already follows: every writer returns a new object, so an
 * object that has been handed out can never change. Applying this to a value
 * something else mutates would serve a stale result forever.
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
