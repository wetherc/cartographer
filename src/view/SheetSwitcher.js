/**
 * The character a key moves to in the party switcher of the full sheet. The
 * switcher is a tab list, so Left and Right step through it and wrap, and
 * Home and End jump to the first and last character. Any other key returns
 * null, which leaves the key to the browser.
 * @param {string} key the `key` of the keyboard event
 * @param {number} index the position of the focused tab
 * @param {number} count how many tabs the switcher has
 * @returns {number | null}
 */
export function switcherIndex(key, index, count) {
  if (count === 0) return null;
  if (key === 'ArrowRight') return (index + 1) % count;
  if (key === 'ArrowLeft') return (index - 1 + count) % count;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return null;
}
