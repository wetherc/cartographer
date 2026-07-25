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
