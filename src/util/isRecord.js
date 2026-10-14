/**
 * True when the value is a plain record: an object that is neither null nor
 * an array. Load, diff, and pack code use it before they read the fields of
 * a value that came from JSON.
 * @param {unknown} value
 * @returns {value is Record<string, any>}
 */
export function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
