import { labelSize } from './CanvasText.js';
import { toDisplay } from './TileCoords.js';

/** @typedef {import('./ExitBands.js').Rect} Rect */

/**
 * Coordinate digits run large: they label a whole row or column, and they draw
 * on empty canvas or a plate rather than over tile art, so they take a high cap.
 * The bounds are in CSS px.
 */
export const COORD_SCALE = { factor: 0.3, min: 14, max: 42 };

/**
 * Tiles smaller than this, in buffer px, draw no coordinate digits. Down to
 * this size a run of labels at the smallest font needs to skip at most every
 * second number on a map under 100 tiles across (see labelStride).
 */
export const MIN_LABELLED_TILE = 13;

/** The space kept between two label plates, as a share of the font size. */
const PLATE_GAP = 0.15;

/**
 * How many tiles apart the labels of one run draw. On small tiles a label
 * plate can be larger than its tile, and the plates of neighbouring labels
 * then overlap. The run labels every tile when the largest plate and a gap
 * fit in one tile, every second tile when they fit in two, and so on. The
 * first tile always has a label, so the run reads 1, 3, 5 at a stride of 2.
 * @param {number} plate the largest plate in the run along the run, in buffer px
 * @param {number} fontSize in buffer px
 * @param {number} size the tile size in buffer px
 * @returns {number}
 */
export function labelStride(plate, fontSize, size) {
  return Math.max(1, Math.ceil((plate + fontSize * PLATE_GAP) / size));
}

/**
 * The view fields that place the coordinate labels.
 * @typedef {Object} CoordView
 * @property {{ width: number, height: number } | null} node
 * @property {number} offsetX
 * @property {number} offsetY
 * @property {number} scale
 * @property {number} canvasWidth
 * @property {number} canvasHeight
 * @property {number} [pixelRatio]
 * @property {Rect[]} [occluders] rects in buffer px of the HTML over the canvas
 */

/**
 * Where the coordinate labels draw. `colY` is the centre line of the column
 * digits and `rowX` the centre line of the row digits. A label pins to the
 * canvas edge when its map edge scrolls out of view. `columns` and `rows`
 * are the rects the two label runs cover on the canvas, in buffer px, or
 * null when that run is off the canvas. `strips` lists the ones present, so
 * an exit band can keep off them.
 * @typedef {{
 *   size: number,
 *   fontSize: number,
 *   colY: number,
 *   rowX: number,
 *   colPinned: boolean,
 *   rowPinned: boolean,
 *   columns: Rect | null,
 *   rows: Rect | null,
 *   strips: Rect[],
 * }} CoordLayout
 */

/**
 * Lay out the coordinate labels of a view, or return null when the tiles are
 * too small to label. The renderer draws from this layout and the exit bands
 * avoid its strips, so a band never covers a digit that is drawn.
 * @param {CoordView} view
 * @param {number} tileSize base tile size in buffer px at scale 1
 * @returns {CoordLayout | null}
 */
export function coordLabelLayout(view, tileSize) {
  const node = view.node;
  if (!node) return null;
  const size = tileSize * view.scale;
  if (size < MIN_LABELLED_TILE) return null;
  const fontSize = labelSize(size, COORD_SCALE, view.pixelRatio);
  const pad = fontSize * 0.9;
  // The plate of a digit reaches 0.6 of the font size past its centre line,
  // and a row label is as wide as its longest number.
  const half = fontSize * 0.6;
  const digits = String(node.height).length;
  const rowHalf = (digits * fontSize * 0.6) / 2 + fontSize * 0.25;
  const left = Math.max(0, view.offsetX);
  const top = Math.max(0, view.offsetY);
  const right = Math.min(view.canvasWidth, view.offsetX + node.width * size);
  const bottom = Math.min(view.canvasHeight, view.offsetY + node.height * size);
  let colPinned = view.offsetY - pad < pad;
  let colY = colPinned ? pad : view.offsetY - pad;
  let rowPinned = view.offsetX - pad < pad;
  let rowX = rowPinned ? pad : view.offsetX - pad;
  // HTML over the canvas hides a digit drawn under it. A wide box, such as
  // the zoom toolbar, moves the whole column run below it, and a tall box
  // moves the whole row run right of it. The boxes go in order of their far
  // edge, so a run that moves past one box is tested against the next. A
  // floating box, such as the mini-map in Play mode, moves no run, and
  // visibleCoordLabels drops the digits under it instead.
  const boxes = (view.occluders ?? []).filter((o) => !o.float);
  for (const o of [...boxes].sort((a, b) => a.y + a.h - (b.y + b.h))) {
    if (o.w <= o.h || !(o.x < right && left < o.x + o.w)) continue;
    if (colY - half < o.y + o.h && o.y < colY + half) {
      colY = o.y + o.h + half;
      colPinned = true;
    }
  }
  for (const o of [...boxes].sort((a, b) => a.x + a.w - (b.x + b.w))) {
    if (o.w > o.h || !(o.y < bottom && top < o.y + o.h)) continue;
    if (rowX - rowHalf < o.x + o.w && o.x < rowX + rowHalf) {
      rowX = o.x + o.w + rowHalf;
      rowPinned = true;
    }
  }
  const columns = right > left ? { x: left, y: colY - half, w: right - left, h: half * 2 } : null;
  const rows = bottom > top ? { x: rowX - rowHalf, y: top, w: rowHalf * 2, h: bottom - top } : null;
  const strips = [columns, rows].filter((r) => r !== null);
  return { size, fontSize, colY, rowX, colPinned, rowPinned, columns, rows, strips };
}

/**
 * The column and row labels to draw from a layout, as display text and the
 * centre of each plate on the canvas. A label whose centre is off the canvas
 * is left out. When the column run is pinned, a row label whose plate would
 * reach up into the column strip is left out, and when the row run is pinned,
 * a column label whose plate would reach left into the row strip is left out.
 * Without this rule, a column run moved below the zoom toolbar draws over the
 * first row labels, and a row run moved right of the Build-mode mini-map draws
 * over the first column labels. A label whose plate overlaps a floating box,
 * such as the mini-map in Play mode, is left out too. Each run labels only
 * every labelStride tiles, so no two plates in a run overlap on small tiles.
 * @param {CoordView} view
 * @param {CoordLayout} layout
 * @returns {{ columns: { text: string, x: number }[], rows: { text: string, y: number }[] }}
 */
export function visibleCoordLabels(view, layout) {
  const { size, fontSize, colPinned, rowPinned } = layout;
  const width = view.node?.width ?? 0;
  const height = view.node?.height ?? 0;
  const half = fontSize * 0.6;
  const rowTop = colPinned && layout.columns ? layout.columns.y + layout.columns.h : -Infinity;
  const colLeft = rowPinned && layout.rows ? layout.rows.x + layout.rows.w : -Infinity;
  const floats = (view.occluders ?? []).filter((o) => o.float);
  /** @type {(x: number, y: number, w: number, h: number) => boolean} */
  const hidden = (x, y, w, h) =>
    floats.some((o) => x < o.x + o.w && o.x < x + w && y < o.y + o.h && o.y < y + h);
  const rowHalf = layout.rows ? layout.rows.w / 2 : 0;
  const widest = String(toDisplay(width - 1)).length * fontSize * 0.6 + fontSize * 0.5;
  const colStride = labelStride(widest, fontSize, size);
  const rowStride = labelStride(half * 2, fontSize, size);
  const columns = [];
  for (let i = 0; i < width; i += colStride) {
    const x = view.offsetX + (i + 0.5) * size;
    const text = String(toDisplay(i));
    const plateHalf = (text.length * fontSize * 0.6) / 2 + fontSize * 0.25;
    if (x < 0 || x > view.canvasWidth || x - plateHalf < colLeft) continue;
    if (hidden(x - plateHalf, layout.colY - half, plateHalf * 2, half * 2)) continue;
    columns.push({ text, x });
  }
  const rows = [];
  for (let i = 0; i < height; i += rowStride) {
    const y = view.offsetY + (i + 0.5) * size;
    if (y < 0 || y > view.canvasHeight || y - half < rowTop) continue;
    if (hidden(layout.rowX - rowHalf, y - half, rowHalf * 2, half * 2)) continue;
    rows.push({ text: String(toDisplay(i)), y });
  }
  return { columns, rows };
}

/**
 * The padding a fit keeps for the coordinate labels at one label font size,
 * in buffer px. `lead` is the room at the top and left edges of the map. A
 * label is pinned to the canvas edge, over the first row or column, when the
 * map edge sits closer than two label paddings (1.8 font sizes), so `lead`
 * keeps that much, up to 64 CSS px. `labelDepth` is the room the column label
 * plate needs below a wide box at the top, 1.5 font sizes.
 * @param {number} fontSize in buffer px
 * @param {number} pixelRatio
 * @returns {{ lead: number, labelDepth: number }}
 */
export function coordLabelRoom(fontSize, pixelRatio) {
  return { lead: Math.min(64 * pixelRatio, 1.8 * fontSize), labelDepth: 1.5 * fontSize };
}

/**
 * Fit a view with only the label room that its own labels need. The label
 * font grows with the zoom, up to the cap of COORD_SCALE. A fit that keeps
 * room for the largest font can leave tiles a few pixels under the size that
 * draws labels, while the smaller font of those tiles needs far less room.
 * Each pass fits again with the font of the last fit, and keeps the new fit
 * only while its own font still fits in the room that pass kept.
 * @template {{ scale: number }} F
 * @param {(fontSize: number) => F} fitAt the fit with room for this font size
 * @param {(scale: number) => number} fontAt the label font size at a scale
 * @param {number} maxFont the largest label font size
 * @returns {F}
 */
export function fitForLabels(fitAt, fontAt, maxFont) {
  let font = maxFont;
  let fitted = fitAt(font);
  for (let pass = 0; pass < 3; pass++) {
    const next = fontAt(fitted.scale);
    if (next >= font) break;
    const candidate = fitAt(next);
    if (fontAt(candidate.scale) > next) break;
    font = next;
    fitted = candidate;
  }
  return fitted;
}
