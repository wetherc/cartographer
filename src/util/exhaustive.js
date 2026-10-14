/**
 * The last step of an `if` chain or a `switch` that handles every member of a
 * union. The parameter type is `never`, so the typecheck fails at the call
 * when a member of the union has no branch above it. At runtime the function
 * returns `fallback`, which covers a value that bypassed the type, such as a
 * hand-edited import.
 * @template T
 * @param {never} _value the narrowed value, which has no type left here
 * @param {T} fallback what the chain gives back for a value of no known member
 * @returns {T}
 */
export function exhaustive(_value, fallback) {
  return fallback;
}
