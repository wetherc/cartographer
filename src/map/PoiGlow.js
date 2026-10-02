/**
 * The glowing gold outline around a point-of-interest tile, drawn from a
 * cached sprite.
 *
 * The glow is a canvas shadow (`shadowBlur`). Firefox draws a blurred shadow
 * on the CPU, at about 1.5 ms for each outline on a desktop and several times
 * that on a phone. A shadow drawn on every frame makes a pan drop frames
 * when a few points of interest are in view. Chromium draws the same shadow
 * in well under 0.1 ms.
 * This module draws the outline and its glow once for each size into an
 * offscreen canvas, and later frames blit that canvas. The sprite contains the
 * glow composited over transparent pixels, and source-over compositing is
 * associative, so the blit gives the same pixels as drawing the shadow and
 * the stroke onto the map.
 *
 * Every side effect is injected, so the cache is testable without a DOM.
 */

import { INK } from './CanvasInk.js';

/**
 * Sprites to keep. A fractional zoom gives cells of two widths, and a span
 * anchor's outline wraps its whole block, so one zoom level needs a few
 * sizes. A zoom sweep mints a new set per level, so the least recently used
 * sprite goes first.
 */
export const GLOW_LIMIT = 48;

/**
 * The stroke and blur for an outline of `size` pixels, and the pad that the
 * sprite adds around the tile for the glow that spills past it. The blur's
 * Gaussian has a sigma of half the `shadowBlur` value, and it fades out at
 * about three sigma.
 * @param {number} size outline extent in device pixels
 */
export function glowMetrics(size) {
  const lineWidth = Math.max(2, size * 0.06);
  const blur = size * 0.18;
  return { lineWidth, blur, inset: lineWidth / 2 + 1, pad: Math.ceil(blur * 1.5) + 2 };
}

/**
 * Stroke the outline with its glow, with the tile's top-left corner at x, y.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} size
 */
export function strokeGlow(ctx, x, y, size) {
  const { lineWidth, blur, inset } = glowMetrics(size);
  ctx.save();
  ctx.strokeStyle = INK.goldLit;
  ctx.lineWidth = lineWidth;
  ctx.shadowColor = INK.goldGlow;
  ctx.shadowBlur = blur;
  ctx.strokeRect(x + inset, y + inset, size - inset * 2, size - inset * 2);
  ctx.restore();
}

export class PoiGlow {
  /**
   * @param {{ createCanvas?: (width: number, height: number) => HTMLCanvasElement | null }} [options]
   */
  constructor(options = {}) {
    this.createCanvas =
      options.createCanvas ??
      ((width, height) => {
        if (typeof document === 'undefined') return null;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        return canvas;
      });
    /**
     * Sprites by outline size, in least recently used order: a hit moves its
     * entry to the end, and an insert past the limit drops the first entry.
     * @type {Map<number, HTMLCanvasElement>}
     */
    this.sprites = new Map();
  }

  /**
   * Draw the outline for a tile at sx, sy. Both are whole device pixels, so
   * the blit lands on the pixel grid and does not resample the sprite. When
   * no offscreen canvas is available, the outline draws straight onto ctx.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} sx
   * @param {number} sy
   * @param {number} size
   */
  draw(ctx, sx, sy, size) {
    const sprite = this._sprite(size);
    if (!sprite) {
      strokeGlow(ctx, sx, sy, size);
      return;
    }
    const { pad } = glowMetrics(size);
    ctx.drawImage(sprite, sx - pad, sy - pad);
  }

  /**
   * The cached sprite for a size, drawn on a miss, or null when no canvas
   * can be made.
   * @param {number} size
   * @returns {HTMLCanvasElement | null}
   */
  _sprite(size) {
    const cached = this.sprites.get(size);
    if (cached) {
      this.sprites.delete(size);
      this.sprites.set(size, cached);
      return cached;
    }
    const { pad } = glowMetrics(size);
    const canvas = this.createCanvas(size + pad * 2, size + pad * 2);
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return null;
    strokeGlow(ctx, pad, pad, size);
    if (this.sprites.size >= GLOW_LIMIT) {
      const oldest = this.sprites.keys().next().value;
      if (oldest !== undefined) this.sprites.delete(oldest);
    }
    this.sprites.set(size, canvas);
    return canvas;
  }
}
