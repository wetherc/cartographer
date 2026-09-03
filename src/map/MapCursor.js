/** @typedef {{ x: number, y: number }} Coords */

import { clamp } from '../util/num.js';

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
 * The side of the map each direction leads off. A cursor that cannot move any
 * further reads as walking off that edge.
 * @type {Record<string, import('../types/map.js').ExitSide>}
 */
const SIDES = {
  ArrowUp: 'north',
  ArrowRight: 'east',
  ArrowDown: 'south',
  ArrowLeft: 'west',
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
 * The side of the node a cursor key heads towards, or null for any other key.
 * @param {string} key
 * @returns {import('../types/map.js').ExitSide | null}
 */
export function cursorSide(key) {
  return SIDES[key] ?? null;
}

/**
 * Get the next keyboard cursor position after an arrow key. The result stays
 * inside the node's width by height grid, so the cursor never leaves the map.
 * A null current cursor means the map was just focused. In that case the
 * cursor starts at the grid center, not at a corner, so the first arrow press
 * moves from the middle.
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
    x: clamp(start.x + delta.x, 0, width - 1),
    y: clamp(start.y + delta.y, 0, height - 1),
  };
}

/**
 * The client (CSS pixel) point at the centre of a grid cell. The keyboard
 * cursor has no pointer position, so anything that opens at "the cursor",
 * the tile tooltip or the tile context menu, opens here instead. The cell
 * rectangle is in buffer pixels, and the canvas may draw smaller or larger
 * than its buffer, so the point scales by the element's on-screen size. A
 * zero-size rectangle (a canvas not laid out yet) keeps the buffer point.
 * @param {Coords} cell
 * @param {{ tileSize: number, offsetX: number, offsetY: number, scale: number }} view
 * @param {{ left: number, top: number, width: number, height: number }} rect the canvas element's client rectangle
 * @param {number} bufferWidth the canvas buffer width in pixels
 * @param {number} bufferHeight the canvas buffer height in pixels
 * @returns {{ clientX: number, clientY: number }}
 */
export function cellClientCenter(cell, view, rect, bufferWidth, bufferHeight) {
  const size = view.tileSize * view.scale;
  const sx = cell.x * size + view.offsetX;
  const sy = cell.y * size + view.offsetY;
  const scaleX = rect.width === 0 ? 1 : rect.width / bufferWidth;
  const scaleY = rect.height === 0 ? 1 : rect.height / bufferHeight;
  return {
    clientX: rect.left + (sx + size / 2) * scaleX,
    clientY: rect.top + (sy + size / 2) * scaleY,
  };
}
