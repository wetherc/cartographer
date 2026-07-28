/**
 * Clamp a number into `[min, max]` without touching its precision. Both bounds
 * are optional, so this also reads as "at least" or "at most" on its own.
 * @param {number} value
 * @param {number} [min]
 * @param {number} [max]
 * @returns {number}
 */
export function clamp(value, min = -Infinity, max = Infinity) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Coerce an unknown value into an integer inside `[min, max]`. Anything that
 * does not parse to a nonzero number — a blank input, text, `undefined`, zero
 * — reads as `fallback`, and the fallback is clamped too, so callers whose
 * fallback is their minimum can leave it off.
 *
 * This is the one place that decides what a garbled number means. It exists
 * because every form field, catalog import, and stepper in the app needs the
 * same answer, and writing the coercion inline let the sites drift apart.
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
