/**
 * Small pure text helpers shared across the UI. Pure, no DOM.
 */

/**
 * Uppercase the first character: "friendly" -> "Friendly". Empty in, empty out.
 * @param {string} text
 * @returns {string}
 */
export function capitalize(text) {
  return text.length === 0 ? text : text[0].toUpperCase() + text.slice(1);
}

/**
 * An id derived from a name: "Healing Potion" -> "healing-potion". Used where a
 * GM-typed name has to become a key, so runs of whitespace collapse to one dash
 * rather than to several.
 * @param {string} name
 * @returns {string}
 */
export function slugify(name) {
  return name.trim().toLowerCase().replace(/\s+/g, '-');
}

/**
 * The comma-joined-list convention the modal's multi-value fields share: absent
 * is empty, and an empty segment is dropped rather than becoming a blank entry.
 * @param {string | undefined} value
 * @returns {string[]}
 */
export function splitList(value) {
  return value === undefined ? [] : String(value).split(',').filter(Boolean);
}

/**
 * The same list, trimmed, for the tag entry: a GM typing "elvish, dwarvish" into
 * one paste should not get a pill with a leading space.
 * @param {string | undefined} value
 * @returns {string[]}
 */
export function splitTrimmedList(value) {
  return splitList(value)
    .map((entry) => entry.trim())
    .filter(Boolean);
}
