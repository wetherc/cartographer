/**
 * Clamp a number into the range `[min, max]` without changing its precision.
 * Both bounds are optional. With one bound only, this function acts as
 * "at least" or "at most".
 * @param {number} value
 * @param {number} [min]
 * @param {number} [max]
 * @returns {number}
 */
export function clamp(value, min = -Infinity, max = Infinity) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Coerce an unknown value into an integer inside `[min, max]`. If the value
 * does not parse to a nonzero number (a blank input, text, `undefined`, or
 * zero), the function returns `fallback`. The function clamps the fallback
 * too, so a caller whose fallback equals its minimum can omit it.
 *
 * This function is the one place that decides what an invalid number means.
 * Every form field, catalog import, and stepper in the app needs the same
 * answer. Inline coercion at each site let the logic drift apart between
 * sites.
 * @param {unknown} value
 * @param {number} [min]
 * @param {number} [max]
 * @param {number} [fallback] defaults to `min` when `min` is finite, else 0
 * @returns {number}
 */
export function clampInt(value, min = -Infinity, max = Infinity, fallback = undefined) {
  const spare = fallback ?? (Number.isFinite(min) ? min : 0);
  return clamp(Math.floor(Number(value)) || spare, min, max);
}
