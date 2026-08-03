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
 * The indefinite article a phrase reads with: "an Acrobatics check" against "a
 * Stealth check". The rule here is the spelling one, a vowel letter first, not
 * the spoken one, so a phrase that starts with a consonant sound spelled with a
 * vowel would come out wrong. Nothing the app names does.
 * @param {string} phrase
 * @returns {'a' | 'an'}
 */
export function article(phrase) {
  return /^[aeiou]/i.test(phrase) ? 'an' : 'a';
}

/**
 * Derive an id from a name: "Healing Potion" becomes "healing-potion". Use
 * this where a GM-typed name must become a key. Every run of characters that
 * an id cannot hold, whitespace and punctuation alike, collapses to one dash,
 * and the leading and trailing dashes come off. A name with no usable
 * characters gives an empty string. This is the one slug rule in the app.
 * `Roster.slugId` adds the "entry" fallback and the collision suffix on top
 * of it.
 * @param {string} name
 * @returns {string}
 */
export function slugify(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
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
