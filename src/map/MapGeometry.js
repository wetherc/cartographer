/**
 * Pure grid and screen coordinate math shared by MapCanvas and the map
 * modules that reason about tile positions: fog of war, region grouping,
 * descriptions, and paint. This module holds no canvas or DOM state, so it
 * stays unit-testable in isolation.
 */

import { clamp } from '../util/num.js';

/** @typedef {import('../types/map.js').MapNode} MapNode */

/**
 * Grid tiles use "x,y" as their id, for example "3,4". This gives a
 * coordinate without adding position fields to the Tile type. Non-grid
 * tiles, for example hierarchy tests, can use any other id shape.
 * @param {string} id
 * @returns {{ x: number, y: number } | null}
 */
export function parseCoords(id) {
  const match = /^(\d+),(\d+)$/.exec(id);
  if (!match) return null;
  return { x: Number(match[1]), y: Number(match[2]) };
}

/**
 * The id of the grid tile at (x, y). This is the inverse of parseCoords, and
 * the only place that writes the "x,y" format. Everything that builds a
 * tile id goes through here, so the format is stated once, not in every
 * loop that walks a grid.
 * @param {number} x
 * @param {number} y
 * @returns {string}
 */
export function tileIdAt(x, y) {
  return `${x},${y}`;
}

/**
 * The four orthogonal neighbor offsets as `[dx, dy]` pairs, and the eight
 * that add the diagonals. Everything that walks a cell's neighbors iterates
 * one of these lists instead of writing the values inline, so the order
 * stays fixed in one place. The generators consume this order under a
 * seeded RNG, where a reordering changes every generated map.
 * @type {ReadonlyArray<readonly [number, number]>}
 */
export const NEIGHBORS4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** @type {ReadonlyArray<readonly [number, number]>} */
export const NEIGHBORS8 = [...NEIGHBORS4, [1, 1], [1, -1], [-1, 1], [-1, -1]];

/**
 * A bounds-clamped test against a flat grid of cells indexed `y * width + x`.
 * The returned predicate reports whether the cell at (x, y) holds `value`,
 * and answers false off the grid instead of reading a wrapped-around index.
 * This clamp removes the need for neighbor walks to special-case the
 * border, and stops water or floor running off the map edge from appearing
 * to continue on the far side.
 * @template T
 * @param {readonly T[]} cells
 * @param {number} width
 * @param {number} height
 * @param {T} value
 * @returns {(x: number, y: number) => boolean}
 */
export function maskAt(cells, width, height, value) {
  return (x, y) => x >= 0 && y >= 0 && x < width && y < height && cells[y * width + x] === value;
}

/**
 * Whether (x, y) falls inside a node's width by height grid. A caller that
 * holds an id instead of a coordinate pair must use `TilePaint.isInBounds`,
 * which parses the id first and then asks this function.
 * @param {MapNode} node
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
export function inBounds(node, x, y) {
  return x >= 0 && y >= 0 && x < node.width && y < node.height;
}

/**
 * The screen-space rectangle for a tile at grid position (x, y), given the
 * current pan offset and zoom scale.
 * @param {number} x
 * @param {number} y
 * @param {number} tileSize base tile size in CSS px at scale 1
 * @param {number} offsetX pan offset in screen px
 * @param {number} offsetY pan offset in screen px
 * @param {number} scale zoom factor
 * @returns {{ sx: number, sy: number, size: number }}
 */
export function tileRect(x, y, tileSize, offsetX, offsetY, scale) {
  const size = tileSize * scale;
  return { sx: x * size + offsetX, sy: y * size + offsetY, size };
}

/**
 * The screen-space pixel of the cell boundary at grid line `k`, rounded to a
 * whole pixel. Every rectangle the renderer draws derives its edges from
 * here, and the cell grid strokes its lines here too. With a fractional zoom
 * scale, rounding each edge once keeps a tile, its fog, its block image, and
 * the grid line between cells on the same pixel. Rounding a position and a
 * width separately instead let tiles land a half pixel off the grid stroke,
 * and the antialiased tile edge doubled some grid lines and not others.
 * @param {number} k grid line index (a cell at x spans cellEdge(x) to cellEdge(x + 1))
 * @param {number} size tile size in screen px (tileSize * scale)
 * @param {number} offset pan offset in screen px
 * @returns {number}
 */
export function cellEdge(k, size, offset) {
  return Math.round(k * size + offset);
}

/**
 * The inverse of tileRect: the grid cell that contains a given screen point.
 * @param {number} screenX
 * @param {number} screenY
 * @param {number} tileSize
 * @param {number} offsetX
 * @param {number} offsetY
 * @param {number} scale
 * @returns {{ x: number, y: number }}
 */
export function screenToTile(screenX, screenY, tileSize, offsetX, offsetY, scale) {
  const size = tileSize * scale;
  return {
    x: Math.floor((screenX - offsetX) / size),
    y: Math.floor((screenY - offsetY) / size),
  };
}

/**
 * Clamp a zoom scale to a minimum and maximum range.
 * @param {number} scale
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clampZoom(scale, min, max) {
  return clamp(scale, min, max);
}

/**
 * Convert a client (viewport) point to the canvas's internal buffer-pixel
 * space. A canvas can draw at a different CSS size than its internal pixel
 * buffer. For example, `max-width: 100%` shrinks the element while `width`
 * and `height` attributes fix the buffer. `getBoundingClientRect()` alone
 * gives CSS-space coordinates. All buffer-space tile math must first scale
 * by the buffer-to-CSS ratio, or every click, drag, and zoom anchor lands
 * at the wrong point.
 * @param {number} clientX
 * @param {number} clientY
 * @param {DOMRect} rect result of canvas.getBoundingClientRect()
 * @param {number} bufferWidth canvas.width
 * @param {number} bufferHeight canvas.height
 * @returns {{ x: number, y: number, scaleX: number, scaleY: number }}
 */
export function clientToBuffer(clientX, clientY, rect, bufferWidth, bufferHeight) {
  const { scaleX, scaleY } = bufferScale(rect, bufferWidth, bufferHeight);
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
    scaleX,
    scaleY,
  };
}

/**
 * The buffer-to-CSS pixel ratio of a canvas on its own, for cases that scale
 * a delta instead of converting a point. Examples are a drag or pinch
 * measured in client pixels, and panning an offset that lives in buffer
 * pixels. This carries the same guard against a zero-size rectangle as
 * clientToBuffer, which is built on this function.
 * @param {{ width: number, height: number }} rect result of canvas.getBoundingClientRect()
 * @param {number} bufferWidth canvas.width
 * @param {number} bufferHeight canvas.height
 * @returns {{ scaleX: number, scaleY: number }}
 */
export function bufferScale(rect, bufferWidth, bufferHeight) {
  return {
    scaleX: rect.width === 0 ? 1 : bufferWidth / rect.width,
    scaleY: rect.height === 0 ? 1 : bufferHeight / rect.height,
  };
}

/**
 * A screen-space rectangle for a multi-tile block, plus whether it
 * intersects the canvas at all.
 * @typedef {{ x: number, y: number, w: number, h: number, visible: boolean }} BlockRect
 */

/** A reusable BlockRect for a caller to pass to blockRect. @returns {BlockRect} */
export function newBlockRect() {
  return { x: 0, y: 0, w: 0, h: 0, visible: false };
}

/**
 * The screen-space rectangle for a block spanning the cells minX to maxX by
 * minY to maxY. `visible` is false when the block falls entirely off the canvas.
 * The edges come from cellEdge, so a block image lands on the same pixels as
 * the tiles and the grid lines around it.
 *
 * The result is written into the caller's `out` argument instead of
 * returned fresh. The three renderer passes that use this run once per
 * block per frame, and a fresh rectangle each time recreates the
 * per-block garbage that inlining this arithmetic removed. `out` is
 * therefore a scratch value. Read its fields before the next call, and never store it.
 * @param {BlockRect} out
 * @param {{ minX: number, minY: number, maxX: number, maxY: number }} bounds
 * @param {{ offsetX: number, offsetY: number, canvasWidth: number, canvasHeight: number }} view
 * @param {number} size tile size in screen px (tileSize * scale)
 * @returns {BlockRect} the same `out`, filled
 */
export function blockRect(out, bounds, view, size) {
  const x = cellEdge(bounds.minX, size, view.offsetX);
  const y = cellEdge(bounds.minY, size, view.offsetY);
  const w = cellEdge(bounds.maxX + 1, size, view.offsetX) - x;
  const h = cellEdge(bounds.maxY + 1, size, view.offsetY) - y;
  out.x = x;
  out.y = y;
  out.w = w;
  out.h = h;
  out.visible = !(x + w < 0 || y + h < 0 || x > view.canvasWidth || y > view.canvasHeight);
  return out;
}

/**
 * Compute the zoom scale and pan offsets that frame an extent of
 * `extentW` by `extentH`, in world pixels at scale 1, centered inside a
 * `bufferW` by `bufferH` canvas with some padding. A node then loads
 * filling the view instead of adrift in the backdrop at an arbitrary zoom.
 * @param {number} extentW
 * @param {number} extentH
 * @param {number} bufferW
 * @param {number} bufferH
 * @param {{ padding?: number, minScale?: number, maxScale?: number }} [options]
 * @returns {{ scale: number, offsetX: number, offsetY: number }}
 */
export function fitToExtent(extentW, extentH, bufferW, bufferH, options = {}) {
  const padding = options.padding ?? 24;
  if (extentW <= 0 || extentH <= 0 || bufferW <= 0 || bufferH <= 0) {
    return { scale: 1, offsetX: 0, offsetY: 0 };
  }
  const availW = Math.max(1, bufferW - padding * 2);
  const availH = Math.max(1, bufferH - padding * 2);
  const scale = clampZoom(
    Math.min(availW / extentW, availH / extentH),
    options.minScale ?? 0.25,
    options.maxScale ?? 4,
  );
  return {
    scale,
    offsetX: (bufferW - extentW * scale) / 2,
    offsetY: (bufferH - extentH * scale) / 2,
  };
}
