/**
 * Small pure text helpers shared across the UI. These functions are pure and
 * do not use the DOM.
 */

/**
 * Uppercase the first character: "friendly" becomes "Friendly". If the input
 * is empty, the function returns an empty string.
 * @param {string} text
 * @returns {string}
 */
export function capitalize(text) {
  return text.length === 0 ? text : text[0].toUpperCase() + text.slice(1);
}

/**
 * Derive an id from a name: "Healing Potion" becomes "healing-potion". Use
 * this where a GM-typed name must become a key. Runs of whitespace collapse
 * to one dash instead of several.
 * @param {string} name
 * @returns {string}
 */
export function slugify(name) {
  return name.trim().toLowerCase().replace(/\s+/g, '-');
}

/**
 * Parse the comma-joined list format that the multi-value fields of the modal
 * share. A missing value returns an empty list. An empty segment is removed
 * instead of becoming a blank entry.
 * @param {string | undefined} value
 * @returns {string[]}
 */
export function splitList(value) {
  return value === undefined ? [] : String(value).split(',').filter(Boolean);
}

/**
 * Return the same list, trimmed, for tag entry. This removes leading spaces,
 * so a GM who pastes "elvish, dwarvish" in one entry does not get a pill with
 * a leading space.
 * @param {string | undefined} value
 * @returns {string[]}
 */
export function splitTrimmedList(value) {
  return splitList(value)
    .map((entry) => entry.trim())
    .filter(Boolean);
}
