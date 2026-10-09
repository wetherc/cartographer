/**
 * The HP that a damage or heal amount field asks for: a whole number of 1 or
 * more. A decimal rounds down. An empty, zero, negative, or non-numeric entry
 * reads as null, and the damage and heal buttons beside the field stay
 * disabled while it does.
 * @param {unknown} raw the field text
 * @returns {number | null}
 */
export function hpAmount(raw) {
  const value = Math.floor(Number(raw));
  return Number.isFinite(value) && value >= 1 ? value : null;
}
