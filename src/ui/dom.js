/**
 * Fetch a required mount-point element, failing loudly at startup if the
 * markup and the wiring in main.js ever drift apart.
 * @param {string} id
 * @returns {HTMLElement}
 */
export function mustGetElement(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Required element #${id} is missing from index.html`);
  return el;
}
