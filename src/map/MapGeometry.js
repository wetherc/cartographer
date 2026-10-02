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
 * The cell index `y * width + x` of a grid tile id, or -1 when the id is not
 * the id that tileIdAt writes for a cell inside a width x height grid. So
 * "01,2" and "1,2,3" give -1, although parseCoords reads the first as (1, 2).
 * Each cell then has exactly one id. The function reads the id one character
 * at a time and allocates nothing, so a loop over every tile of a node can
 * call it where a parseCoords call per tile costs a regular expression match
 * and an object.
 * @param {string} id
 * @param {number} width
 * @param {number} height
 * @returns {number}
 */
export function gridCellOf(id, width, height) {
  const comma = id.indexOf(',');
  const x = decimalAt(id, 0, comma);
  if (x < 0 || x >= width) return -1;
  const y = decimalAt(id, comma + 1, id.length);
  if (y < 0 || y >= height) return -1;
  return y * width + x;
}

/**
 * Whether a tile id names a grid position, as `parseCoords` reads it. The
 * canonical in-bounds id takes the fast path of `gridCellOf`, and only an id
 * outside that form pays for the regular expression.
 * @param {string} id
 * @param {number} width
 * @param {number} height
 * @returns {boolean}
 */
export function hasCoords(id, width, height) {
  return gridCellOf(id, width, height) >= 0 || parseCoords(id) !== null;
}

/**
 * The value of `text[start, end)` as a decimal integer with no sign and no
 * leading zero, or -1 when the range is empty or holds anything else.
 * @param {string} text
 * @param {number} start
 * @param {number} end
 * @returns {number}
 */
function decimalAt(text, start, end) {
  if (end <= start || (text.charCodeAt(start) === 48 && end - start > 1)) return -1;
  let value = 0;
  for (let i = start; i < end; i++) {
    const digit = text.charCodeAt(i) - 48;
    if (digit < 0 || digit > 9) return -1;
    value = value * 10 + digit;
  }
  return value;
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
 *
 * A whole-pixel offset is added after the rounding. The terrain layer draws
 * at one offset and copies the pixels to another, so an edge has to move by
 * exactly the difference. `Math.round(k * size + offset)` does not always do
 * that: when `k * size` falls a hair under a half, the floating-point sum
 * rounds to the half at some offsets and not at others, and a whole column
 * of tiles shifts by a pixel.
 * @param {number} k grid line index (a cell at x spans cellEdge(x) to cellEdge(x + 1))
 * @param {number} size tile size in screen px (tileSize * scale)
 * @param {number} offset pan offset in screen px
 * @returns {number}
 */
export function cellEdge(k, size, offset) {
  return Number.isInteger(offset) ? Math.round(k * size) + offset : Math.round(k * size + offset);
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
 * Convert a client rect, such as an element laid over the canvas, to the
 * canvas's buffer-pixel space. This applies clientToBuffer to the top-left
 * corner and scales the size by the same ratio.
 * @param {{ left: number, top: number, width: number, height: number }} client
 * @param {DOMRect} rect result of canvas.getBoundingClientRect()
 * @param {number} bufferWidth canvas.width
 * @param {number} bufferHeight canvas.height
 * @returns {{ x: number, y: number, w: number, h: number }}
 */
export function clientRectToBuffer(client, rect, bufferWidth, bufferHeight) {
  const { x, y, scaleX, scaleY } = clientToBuffer(
    client.left,
    client.top,
    rect,
    bufferWidth,
    bufferHeight,
  );
  return { x, y, w: client.width * scaleX, h: client.height * scaleY };
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
 * The smallest tile a fitted view draws, in screen pixels. Below this the
 * tile art and the party marker stop reading, so a fit that would need a
 * smaller tile shows part of the map at this size instead of all of it
 * unreadably small.
 */
export const READABLE_TILE_PX = 32;

/**
 * The zoom scale at which a tile draws `READABLE_TILE_PX` wide. This is the
 * floor a fit-to-view will not go under.
 * @param {number} tileSize world pixels per tile at scale 1
 * @returns {number}
 */
export function readableScale(tileSize) {
  return tileSize > 0 ? READABLE_TILE_PX / tileSize : 0;
}

/**
 * The padding a fitted view keeps on each side of the map, in buffer px.
 * @typedef {{ top: number, right: number, bottom: number, left: number }} FitSides
 */

/**
 * The padding a fit keeps on each side of the map, so the chrome around the
 * map does not cover it. The top and left start at `lead`, which fits the
 * coordinate labels, and the bottom and right start at `trail`. A north or
 * south side with an edge exit adds `bandDepth` for its exit band. A west or
 * east band is wide, and room for it shrinks a map on a narrow canvas far
 * more than the band needs, so that band slides clear of the map instead. A
 * tall occluder at the top corner pushes the left or right side past it. A
 * floating occluder, such as the mini-map in Play mode, reserves no room, because the map
 * may pass under it. On the left, the side also keeps `lead` past a tall
 * occluder for the row labels. A
 * wide occluder at the top, such as the zoom toolbar, pushes the top side
 * below it, with `labelDepth` left for the column label plate (half of
 * `lead` when not given). The caller scales `inset` and `labelDepth` by the
 * pixel ratio, because every other length here is in buffer px.
 * @param {{
 *   lead: number,
 *   trail: number,
 *   exitSides?: import('../types/map.js').ExitSide[],
 *   bandDepth?: number,
 *   occluders?: { x: number, y: number, w: number, h: number, float?: boolean }[],
 *   canvasWidth: number,
 *   inset?: number,
 *   labelDepth?: number,
 * }} opts
 * @returns {FitSides}
 */
export function fitSides(opts) {
  const { lead, trail, canvasWidth } = opts;
  const inset = opts.inset ?? 8;
  const labelDepth = opts.labelDepth ?? lead / 2;
  const exits = new Set(opts.exitSides ?? []);
  const depth = (opts.bandDepth ?? 0) + inset;
  const sides = {
    top: lead + (exits.has('north') ? depth : 0),
    right: trail,
    bottom: trail + (exits.has('south') ? depth : 0),
    left: lead,
  };
  for (const o of opts.occluders ?? []) {
    if (o.float || o.y > inset * 2) continue;
    if (o.w > o.h) sides.top = Math.max(sides.top, o.y + o.h + labelDepth);
    else if (o.x <= inset * 2) sides.left = Math.max(sides.left, o.x + o.w + lead);
    else if (o.x + o.w >= canvasWidth - inset * 2) {
      sides.right = Math.max(sides.right, canvasWidth - o.x + inset);
    }
  }
  return sides;
}

/**
 * The pan offset along one axis. The extent is centered between the two
 * paddings when it fits the buffer. Otherwise the view centers on `focus`
 * when one is given, or starts at the top or left edge of the map. The
 * offset stays between the two edges, so the map never pulls away from the
 * padding on either side.
 * @param {number} extent the scaled extent along this axis
 * @param {number} buffer the canvas size along this axis
 * @param {number} lead the padding before the map, at the top or left
 * @param {number} trail the padding after the map, at the bottom or right
 * @param {number | undefined} focus the scaled position to center on
 * @returns {number}
 */
function fitOffset(extent, buffer, lead, trail, focus) {
  if (extent + lead + trail <= buffer) return lead + (buffer - lead - trail - extent) / 2;
  if (focus === undefined) return lead;
  return Math.min(lead, Math.max(buffer - trail - extent, buffer / 2 - focus));
}

/**
 * Compute the zoom scale and pan offsets that frame an extent of
 * `extentW` by `extentH`, in world pixels at scale 1, centered inside a
 * `bufferW` by `bufferH` canvas with some padding. A node then loads
 * filling the view instead of adrift in the backdrop at an arbitrary zoom.
 *
 * `readableScale` is a floor under the fitted zoom. When the whole extent
 * would need a smaller scale than that, the view uses the floor and shows
 * as much of the map as fits. A narrow phone layout then shows a readable
 * part of a large region instead of the whole region at a quarter size.
 * On the axis that overflows, the view centers on `focus` (world pixels at
 * scale 1), such as the party's tile, and otherwise starts at the padding.
 *
 * `padding` applies to all four sides. `leadPadding` replaces it on the top
 * and left sides only, where the coordinate labels hang off the grid. The
 * bottom and right sides then need less space, and the fit zooms closer.
 * `sides`, from fitSides, replaces both with one padding for each side.
 * @param {number} extentW
 * @param {number} extentH
 * @param {number} bufferW
 * @param {number} bufferH
 * @param {{ padding?: number, leadPadding?: number, sides?: FitSides, minScale?: number, maxScale?: number, readableScale?: number, focus?: { x: number, y: number } | null }} [options]
 * @returns {{ scale: number, offsetX: number, offsetY: number }}
 */
export function fitToExtent(extentW, extentH, bufferW, bufferH, options = {}) {
  const trail = options.padding ?? 24;
  const lead = options.leadPadding ?? trail;
  const sides = options.sides ?? { top: lead, right: trail, bottom: trail, left: lead };
  if (extentW <= 0 || extentH <= 0 || bufferW <= 0 || bufferH <= 0) {
    return { scale: 1, offsetX: 0, offsetY: 0 };
  }
  const availW = Math.max(1, bufferW - sides.left - sides.right);
  const availH = Math.max(1, bufferH - sides.top - sides.bottom);
  const whole = Math.min(availW / extentW, availH / extentH);
  const scale = clampZoom(
    Math.max(whole, options.readableScale ?? 0),
    options.minScale ?? 0.25,
    options.maxScale ?? 4,
  );
  const focus = options.focus;
  return {
    scale,
    offsetX: fitOffset(
      extentW * scale,
      bufferW,
      sides.left,
      sides.right,
      focus ? focus.x * scale : undefined,
    ),
    offsetY: fitOffset(
      extentH * scale,
      bufferH,
      sides.top,
      sides.bottom,
      focus ? focus.y * scale : undefined,
    ),
  };
}
