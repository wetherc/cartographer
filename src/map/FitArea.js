import { memoizeByIdentity } from '../util/memoize.js';
import { parseCoords } from './MapGeometry.js';

/** @typedef {import('../types/map.js').MapNode} MapNode */

/** Cells of unexplored map that a Play fit keeps around the revealed tiles. */
export const FIT_MARGIN = 2;

/** The fewest cells a Play fit frames on each axis, so one revealed tile does not fill the canvas. */
export const MIN_FIT_CELLS = 12;

/**
 * Grow the span lo..hi (inclusive) by the margin and to at least the minimum
 * length, centered on the span, and keep it inside 0..size - 1.
 * @param {number} lo
 * @param {number} hi
 * @param {number} size
 * @returns {{ start: number, length: number }}
 */
function grow(lo, hi, size) {
  const want = Math.min(size, Math.max(hi - lo + 1 + FIT_MARGIN * 2, MIN_FIT_CELLS));
  const start = Math.round((lo + hi + 1) / 2 - want / 2);
  return { start: Math.max(0, Math.min(size - want, start)), length: want };
}

/**
 * The block of cells that a Play-mode fit frames: the bounding box of the
 * revealed tiles, grown by `FIT_MARGIN` cells on each side and to at least
 * `MIN_FIT_CELLS`, and kept inside the node. A fit to the whole node frames
 * mostly fog on a large region, so the explored part shows at a few percent
 * of the canvas. The result is null when no tile is revealed, and the fit
 * then frames the whole node. The box is memoized on the node, so a fit
 * after a reveal scans the tiles once.
 * @type {(node: MapNode) => { x: number, y: number, width: number, height: number } | null}
 */
export const revealedExtent = memoizeByIdentity((node) => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const tile of node.tiles) {
    if (!tile.revealed) continue;
    const at = parseCoords(tile.id);
    if (!at) continue;
    minX = Math.min(minX, at.x);
    minY = Math.min(minY, at.y);
    maxX = Math.max(maxX, at.x);
    maxY = Math.max(maxY, at.y);
  }
  if (minX === Infinity) return null;
  const across = grow(minX, maxX, node.width);
  const down = grow(minY, maxY, node.height);
  return { x: across.start, y: down.start, width: across.length, height: down.length };
});
