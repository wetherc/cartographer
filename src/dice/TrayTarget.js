/**
 * The target of one dice tray roll. The GM types a target (a DC) into the
 * tray, and the app also rolls through the tray with a target of its own,
 * such as the AC of an attack. The typed value stays in the field, so a later
 * sheet check never reads an AC that an attack left behind as its DC.
 */

/**
 * The typed target as a number, or null while the field is blank or does not
 * hold a number.
 * @param {string} text
 * @returns {number | null}
 */
export function parseTarget(text) {
  const target = text.trim() === '' ? null : Number(text);
  return target !== null && Number.isFinite(target) ? target : null;
}

/**
 * The target of one programmatic roll. A roll with `keep` borrows the tray,
 * so its target is the value the GM typed. Any other roll uses the target it
 * passed, for that roll only, and null means it has no target.
 * @param {number | null} passed
 * @param {string} typed the text of the tray's target field
 * @param {boolean} keep
 * @returns {number | null}
 */
export function rollTarget(passed, typed, keep) {
  return keep ? parseTarget(typed) : passed;
}
