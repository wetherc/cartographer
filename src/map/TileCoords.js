import { parseCoords, tileIdAt } from './MapGeometry.js';

/**
 * The one place that converts between stored tile coordinates and the
 * numbers a GM reads or types. A tile id stores its column and row from 0,
 * as in "3,4". Every human-facing surface counts from 1 instead: the labels
 * along the map edge, the screen-reader description, the encounter rows,
 * and the Column and Row fields of a placement dialog. Every one of those
 * surfaces goes through these functions, so the two bases cannot drift
 * apart again.
 */

/**
 * The number a GM sees for a stored 0-based column or row index.
 * @param {number} index
 * @returns {number}
 */
export function toDisplay(index) {
  return index + 1;
}

/**
 * The stored 0-based index for a number a GM typed.
 * @param {number} shown
 * @returns {number}
 */
export function fromDisplay(shown) {
  return shown - 1;
}

/**
 * The 1-based column and row of a tile id, or null when the id is not a grid
 * coordinate.
 * @param {string} tileId
 * @returns {{ column: number, row: number } | null}
 */
export function displayCoords(tileId) {
  const coords = parseCoords(tileId);
  return coords ? { column: toDisplay(coords.x), row: toDisplay(coords.y) } : null;
}

/**
 * A tile position as a GM reads it, for example "column 4, row 5". A tile id
 * that is not a grid coordinate (for example, from a hand-edited save) is
 * shown as it is, so the text still says something.
 * @param {string} tileId
 * @returns {string}
 */
export function describeTile(tileId) {
  const shown = displayCoords(tileId);
  return shown ? `column ${shown.column}, row ${shown.row}` : tileId;
}

/**
 * The tile id at a 1-based column and row, the inverse of `displayCoords`.
 * @param {number} column
 * @param {number} row
 * @returns {string}
 */
export function tileIdFromDisplay(column, row) {
  return tileIdAt(fromDisplay(column), fromDisplay(row));
}
