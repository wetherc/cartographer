/** @typedef {{ x: number, y: number }} Coords */

/**
 * The arrow-key directions the map cursor understands, mapped to grid deltas.
 * @type {Record<string, Coords>}
 */
const DELTAS = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
};

/**
 * Whether a key names a cursor direction.
 * @param {string} key
 * @returns {boolean}
 */
export function isCursorKey(key) {
  return key in DELTAS;
}

/**
 * The next keyboard cursor position after an arrow key, clamped inside the
 * node's width x height grid so the cursor never leaves the map. A null current
 * cursor (the map was just focused) starts at the grid centre rather than
 * jumping to a corner, so the first arrow press moves from a sensible middle.
 * @param {Coords | null} cursor current cursor cell, or null if unset
 * @param {string} key an arrow key name (see isCursorKey)
 * @param {number} width grid width in tiles
 * @param {number} height grid height in tiles
 * @returns {Coords} the clamped next cursor cell
 */
export function nextCursor(cursor, key, width, height) {
  const start = cursor ?? { x: Math.floor(width / 2), y: Math.floor(height / 2) };
  const delta = DELTAS[key];
  if (!delta) return start;
  return {
    x: Math.min(width - 1, Math.max(0, start.x + delta.x)),
    y: Math.min(height - 1, Math.max(0, start.y + delta.y)),
  };
}
