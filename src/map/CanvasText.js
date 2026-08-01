/**
 * The text the map canvas draws: coordinate digits, character names, exit
 * labels, and region names. Each of those is a short caption sized from the
 * tile size and set over a plate, so the caption reads over map art. The
 * layers share the sizing rule and the plate drawing through this module,
 * rather than each restating them.
 */

import { clamp } from '../util/num.js';
import { INK } from './CanvasInk.js';

/**
 * Size a label from the on-screen tile size. Font sizes are in buffer pixels,
 * which are devicePixelRatio times denser than CSS pixels, so a caller gives
 * the bounds it wants rather than taking one shared pair: a mean cap draws
 * illegibly on a HiDPI canvas, and a generous floor clutters a zoomed-out map.
 * @param {number} size the tile's on-screen size in buffer px
 * @param {{ factor: number, min: number, max: number }} scale
 * @returns {number} the font size in buffer px
 */
export function labelSize(size, { factor, min, max }) {
  return Math.round(clamp(size * factor, min, max));
}

/**
 * The canvas font string for a label of this size. Labels are semi-bold by
 * default, which is what carries a caption over textured terrain. A caller
 * passes `weight` for a caption that reads as body text instead.
 * @param {number} fontSize in buffer px
 * @param {string} [weight]
 * @returns {string}
 */
export function labelFont(fontSize, weight = '600') {
  return `${weight} ${fontSize}px sans-serif`;
}

/**
 * How a label is drawn. `plate` picks the backing shape: a `pill` for a label
 * that floats on its own, a `rect` for one that stacks with others, or null
 * for a label already inside a drawn body such as an exit band. The paddings
 * default to fractions of the font size, so a plate grows with its text.
 * @typedef {{
 *   fontSize: number,
 *   color?: string,
 *   weight?: string,
 *   align?: CanvasTextAlign,
 *   baseline?: CanvasTextBaseline,
 *   plate?: 'pill' | 'rect' | null,
 *   plateColor?: string,
 *   alpha?: number,
 *   padX?: number,
 *   padY?: number,
 * }} LabelOpts
 */

/**
 * Draw one label, and its plate, at an anchor point. The anchor is the point
 * `align` and `baseline` describe, the same point `fillText` would take, and
 * the plate is placed around it from the measured text. This saves and
 * restores the context, so it leaves no font, alignment, or alpha behind, and
 * it keeps any clip the caller set.
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} x
 * @param {number} y
 * @param {LabelOpts} opts
 */
export function drawPlatedLabel(ctx, text, x, y, opts) {
  const {
    fontSize,
    color = INK.labelText,
    weight = '600',
    align = 'center',
    baseline = 'middle',
    plate = null,
    plateColor = INK.labelPlate,
    alpha = 1,
    padX = fontSize * 0.25,
    padY = fontSize * 0.1,
  } = opts;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = labelFont(fontSize, weight);
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  if (plate) {
    const w = ctx.measureText(text).width + padX * 2;
    const h = fontSize + padY * 2;
    // The plate wraps the text where the text will land, so it follows the
    // same alignment, and the padding falls outside the glyphs on every side.
    let left = x - padX;
    if (align === 'center') left = x - w / 2;
    else if (align === 'right' || align === 'end') left = x - w + padX;
    let top = y - padY;
    if (baseline === 'middle') top = y - h / 2;
    else if (baseline === 'bottom' || baseline === 'alphabetic') top = y - fontSize - padY;
    ctx.fillStyle = plateColor;
    ctx.beginPath();
    ctx.roundRect(left, top, w, h, plate === 'pill' ? h / 4 : 0);
    ctx.fill();
  }
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}
