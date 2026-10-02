import { parseCoords } from './MapGeometry.js';

/** @typedef {import('./ExitBands.js').Rect} Rect */

/** The part of the canvas, on each side, that the followed tile keeps clear of. */
export const FOLLOW_DEADZONE = 0.2;

/** The fewest tiles of room that follow keeps between the tile and the canvas edge. */
export const FOLLOW_MIN_TILES = 3;

/** How long follow waits after the last click on the canvas before it pans, in ms. */
export const FOLLOW_DELAY_MS = 600;

/**
 * The view fields that follow reads, in buffer px.
 * @typedef {{
 *   offsetX: number,
 *   offsetY: number,
 *   scale: number,
 *   tileSize: number,
 *   canvasWidth: number,
 *   canvasHeight: number,
 *   width: number,
 *   height: number,
 * }} FollowView
 */

/**
 * The new offset on one axis: the smallest pan that brings a tile at `p`
 * (its near edge, `size` long) inside the band `[margin, dim - margin]`.
 * An axis where the whole map fits the canvas never pans, so a small map
 * stays where the fit put it.
 * @param {number} offset
 * @param {number} p
 * @param {number} size
 * @param {number} dim canvas length
 * @param {number} extent map length in buffer px
 */
function axisOffset(offset, p, size, dim, extent) {
  if (extent <= dim) return offset;
  const margin = Math.min(
    Math.max(dim * FOLLOW_DEADZONE, size * FOLLOW_MIN_TILES),
    (dim - size) / 2,
  );
  if (p < margin) return offset + margin - p;
  if (p + size > dim - margin) return offset - (p + size - (dim - margin));
  return offset;
}

/**
 * The smallest pan that keeps a followed tile inside the deadzone of the
 * view: 20% of the canvas on each side, and at least three tiles. The zoom
 * never changes. A tile already inside the deadzone, or an id that is not a
 * grid coordinate, gives back the offsets of the view unchanged.
 *
 * `occluders` are the rects, in buffer px, that HTML over the canvas covers,
 * such as the mini-map and the zoom toolbar. A tile that the deadzone pan
 * leaves under one of them gets a further pan that clears it (see
 * `clearOf`), so the party marker never hides under the chrome.
 * @param {FollowView} view
 * @param {string} tileId
 * @param {readonly Rect[]} [occluders]
 * @returns {{ offsetX: number, offsetY: number }}
 */
export function followOffset(view, tileId, occluders = []) {
  const at = parseCoords(tileId);
  if (!at) return { offsetX: view.offsetX, offsetY: view.offsetY };
  const size = view.tileSize * view.scale;
  const pansX = view.width * size > view.canvasWidth;
  const pansY = view.height * size > view.canvasHeight;
  let offsetX = axisOffset(
    view.offsetX,
    view.offsetX + at.x * size,
    size,
    view.canvasWidth,
    view.width * size,
  );
  let offsetY = axisOffset(
    view.offsetY,
    view.offsetY + at.y * size,
    size,
    view.canvasHeight,
    view.height * size,
  );
  for (const box of occluders) {
    const pan = clearOf(
      { x: offsetX + at.x * size, y: offsetY + at.y * size, w: size, h: size },
      box,
      { w: view.canvasWidth, h: view.canvasHeight, pansX, pansY },
    );
    offsetX += pan.dx;
    offsetY += pan.dy;
  }
  return { offsetX, offsetY };
}

/**
 * The smallest pan that moves a tile rect off an occluder, on an axis that
 * pans. It tries each of the four directions and keeps the shortest one, so
 * a tile under the mini-map in the top-left corner moves right or down, by
 * whichever is less. A move that would put the tile past the edge of the
 * canvas does not count. A tile that does not overlap the box, or that no
 * move clears, does not move.
 * @param {Rect} tile
 * @param {Rect} box
 * @param {{ w: number, h: number, pansX: boolean, pansY: boolean }} canvas the canvas
 *   size, and whether the view pans on each axis
 * @returns {{ dx: number, dy: number }}
 */
export function clearOf(tile, box, canvas) {
  const { pansX, pansY } = canvas;
  const overlaps =
    tile.x < box.x + box.w &&
    box.x < tile.x + tile.w &&
    tile.y < box.y + box.h &&
    box.y < tile.y + tile.h;
  if (!overlaps) return { dx: 0, dy: 0 };
  const moves = [
    ...(pansX
      ? [
          { dx: box.x + box.w - tile.x, dy: 0 },
          { dx: box.x - tile.x - tile.w, dy: 0 },
        ]
      : []),
    ...(pansY
      ? [
          { dx: 0, dy: box.y + box.h - tile.y },
          { dx: 0, dy: box.y - tile.y - tile.h },
        ]
      : []),
  ].filter(
    (m) =>
      tile.x + m.dx >= 0 &&
      tile.x + tile.w + m.dx <= canvas.w &&
      tile.y + m.dy >= 0 &&
      tile.y + tile.h + m.dy <= canvas.h,
  );
  /** @param {{ dx: number, dy: number }} m */
  const length = (m) => Math.abs(m.dx) + Math.abs(m.dy);
  return moves.reduce(
    (best, m) => (length(m) < length(best) ? m : best),
    moves[0] ?? { dx: 0, dy: 0 },
  );
}

/**
 * Holds a follow pan back while the pointer is over the canvas, so the
 * tile under the pointer stays the same tile between two clicks. The pan
 * runs when the pointer leaves the canvas, or `FOLLOW_DELAY_MS` after the
 * last click. With the pointer elsewhere, it runs at once.
 */
export class FollowScheduler {
  /**
   * @param {HTMLElement} canvas
   * @param {() => void} apply runs the pan
   */
  constructor(canvas, apply) {
    this.apply = apply;
    this.inside = false;
    this.pending = false;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    this.timer = undefined;
    canvas.addEventListener('pointerenter', () => (this.inside = true));
    canvas.addEventListener('pointerleave', () => {
      this.inside = false;
      this.flush();
    });
    canvas.addEventListener('pointerdown', () => {
      if (this.pending) this.wait();
    });
  }

  /** Ask for a pan. */
  request() {
    this.pending = true;
    if (this.inside) this.wait();
    else this.flush();
  }

  /** Drop a pan that has not run, for example when the view is refitted. */
  cancel() {
    this.pending = false;
    clearTimeout(this.timer);
  }

  /** Restart the delay after a click. */
  wait() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), FOLLOW_DELAY_MS);
  }

  /** Run a pending pan now. */
  flush() {
    clearTimeout(this.timer);
    if (!this.pending) return;
    this.pending = false;
    this.apply();
  }
}
