import { parseCoords } from './MapGeometry.js';
import { labelSize } from './CanvasText.js';
import { coordLabelLayout } from './CoordLabels.js';
import { exitLabel, sideAxis } from './MapExits.js';
import { clamp } from '../util/num.js';

/** @typedef {import('../types/map.js').MapNode} MapNode */
/** @typedef {import('../types/map.js').MapExit} MapExit */
/** @typedef {import('../types/map.js').ExitSide} ExitSide */

/**
 * An exit label rides inside its band, which is sized from the tile too, so the
 * label stays between the coordinate digits and a character name in weight.
 * The band's width is computed from this size, so the geometry and the drawing
 * both take it from here.
 */
const EXIT_LABEL_SCALE = { factor: 0.28, min: 12, max: 26 };

/**
 * The view geometry used to compute an exit band's rect. These fields match
 * what the renderer already keeps in its view snapshot. One extra field
 * gives the cell along the side the band centers on, the traveler's row
 * or column.
 * @typedef {Object} ExitBandGeometry
 * @property {number} width node width in tiles
 * @property {number} height node height in tiles
 * @property {number} tileSize base tile size in buffer px at scale 1
 * @property {number} offsetX pan offset in buffer px
 * @property {number} offsetY pan offset in buffer px
 * @property {number} scale zoom factor
 * @property {number} canvasWidth
 * @property {number} canvasHeight
 * @property {number} alongCell cell index along the side to centre the band on
 * @property {Rect[]} [occluders] rects in buffer px that a band keeps off: the
 *   HTML over the canvas, the coordinate label strips, and the party's tile
 * @property {Rect[]} [chrome] the HTML over the canvas alone, which the
 *   coordinate labels move off
 * @property {Rect[]} [required] the rects a band keeps off when no place
 *   clears every occluder: the HTML over the canvas and the party's tile
 * @property {number} [pixelRatio] buffer px per CSS px
 */

/**
 * A rect in buffer px. `float` marks a box that floats over the map, such as
 * the mini-map. A fit reserves no room for it, and the coordinate labels
 * under it hide instead of moving the whole run.
 * @typedef {{ x: number, y: number, w: number, h: number, float?: boolean }} Rect
 */

/** The band's rect in buffer px, with the type size its label is drawn at. */
/** @typedef {{ x: number, y: number, w: number, h: number, fontSize: number }} ExitBand */

/** The clear space between a band and the canvas edge or an occluder, in buffer px. */
const BAND_INSET = 8;

/**
 * The view state used to place an exit band: the pan, zoom, and canvas
 * fields from the renderer's view snapshot. The fields are named
 * structurally so this module has no canvas dependency.
 * @typedef {Object} ExitBandView
 * @property {number} offsetX
 * @property {number} offsetY
 * @property {number} scale
 * @property {number} canvasWidth
 * @property {number} canvasHeight
 * @property {string | null} [partyTileId]
 * @property {Rect[]} [occluders]
 * @property {number} [pixelRatio]
 */

/**
 * The geometry used to compute one edge exit's band, read from live view
 * state. The band tracks the traveler along the side it leads off: the
 * exit's own `along` when findExits knew the traveler's cell, and the
 * party's cell otherwise. An arrow beside the traveler shows the way out,
 * and stays on-screen on a long map while the traveler is on-screen. If no
 * one stands in the node, the band centers on the side instead.
 *
 * Both the renderer and the pointer build their geometry here. This makes
 * sure that the arrow the GM sees and the rect the click test uses can never
 * differ.
 * @param {MapNode} node node being drawn
 * @param {ExitBandView} view
 * @param {number} tileSize base tile size in buffer px at scale 1
 * @param {MapExit} exit
 * @returns {ExitBandGeometry}
 */
export function exitBandGeometry(node, view, tileSize, exit) {
  const side = exit.kind === 'edge' ? exit.side : 'north';
  const axis = sideAxis(side);
  const party = view.partyTileId ? parseCoords(view.partyTileId) : null;
  const extent = axis === 'x' ? node.width : node.height;
  const own = exit.kind === 'edge' ? exit.along : undefined;
  const alongCell =
    own ?? (party ? (axis === 'x' ? party.x : party.y) : Math.floor((extent - 1) / 2));
  return {
    width: node.width,
    height: node.height,
    tileSize,
    offsetX: view.offsetX,
    offsetY: view.offsetY,
    scale: view.scale,
    canvasWidth: view.canvasWidth,
    canvasHeight: view.canvasHeight,
    alongCell,
    occluders: [...(view.occluders ?? []), ...viewKeepOuts(node, view, tileSize, party)],
    chrome: view.occluders ?? [],
    required: [...(view.occluders ?? []), ...partyKeepOut(view, tileSize, party)],
    pixelRatio: view.pixelRatio ?? 1,
  };
}

/**
 * The parts of the canvas drawing that a band keeps off: the coordinate
 * label strips, and the party's tile. A band over the strip hides the
 * digits a GM reads a tile by, and a band over the party's tile hides the
 * token on its entry tile.
 * @param {MapNode} node
 * @param {ExitBandView} view
 * @param {number} tileSize
 * @param {{ x: number, y: number } | null} party
 * @returns {Rect[]}
 */
function viewKeepOuts(node, view, tileSize, party) {
  const strips = coordLabelLayout({ ...view, node }, tileSize)?.strips ?? [];
  return [...strips, ...partyKeepOut(view, tileSize, party)];
}

/**
 * The party's tile as a keep-out rect, or none when no one stands in the node.
 * @param {ExitBandView} view
 * @param {number} tileSize
 * @param {{ x: number, y: number } | null} party
 * @returns {Rect[]}
 */
function partyKeepOut(view, tileSize, party) {
  if (!party) return [];
  const size = tileSize * view.scale;
  return [{ x: view.offsetX + party.x * size, y: view.offsetY + party.y * size, w: size, h: size }];
}

/**
 * The rect an edge exit's arrow is drawn in, and clicked in. This is a
 * bounded pill, not a whole side of the gutter, because the click target
 * must match what the GM can see. An unbounded band catches every click
 * that missed the map. The rect sits just outside the map border, centered
 * on the traveler's cell along that side, and kept inside the canvas. If the GM pans the map edge out of view, the arrow stays
 * pinned at the viewport edge instead of scrolling away.
 *
 * This is pure geometry with no ctx parameter. The renderer draws this rect,
 * and the pointer hit-tests it, so the two cannot disagree about the
 * arrow's position. A band wider than its gutter is pushed over the map's
 * own tiles. For this reason, the pointer tests bands before it
 * resolves a cell, so the click always lands on what the GM can see. The
 * label width is estimated from the character count for the same reason,
 * because measureText ties the rect to a canvas.
 * @param {MapExit} exit
 * @param {ExitBandGeometry} geom
 * @returns {ExitBand}
 */
export function edgeExitBand(exit, geom) {
  const side = exit.kind === 'edge' ? exit.side : 'north';
  const size = geom.tileSize * geom.scale;
  const ratio = geom.pixelRatio ?? 1;
  const fontSize = labelSize(size, EXIT_LABEL_SCALE, ratio);
  const label = exitLabel(exit);
  // Leave room for the chevron, the gap after it, and the label at the
  // average glyph width of the sans-serif stack.
  const w = Math.min(
    Math.max(geom.canvasWidth - 16, 40),
    fontSize * 1.9 + label.length * fontSize * 0.54,
  );
  const h = Math.round(clamp(size * 0.8, 26 * ratio, 46 * ratio));
  // The gap clears the coordinate labels, which hang off the top and left
  // edges, and is at least 0.55 of a cell.
  const gap = Math.max(10 * ratio, size * 0.55, labelGap(geom, side));
  const along = clamp(geom.alongCell, 0, Math.max(0, sideLength(geom, side) - 1));
  let x;
  let y;
  if (side === 'north' || side === 'south') {
    x = geom.offsetX + (along + 0.5) * size - w / 2;
    y = side === 'north' ? geom.offsetY - gap - h : geom.offsetY + geom.height * size + gap;
  } else {
    y = geom.offsetY + (along + 0.5) * size - h / 2;
    x = side === 'west' ? geom.offsetX - gap - w : geom.offsetX + geom.width * size + gap;
  }
  const placed = avoidOccluders(
    {
      x: clampToCanvas(x, w, geom.canvasWidth),
      y: clampToCanvas(y, h, geom.canvasHeight),
      w,
      h,
    },
    side,
    geom,
  );
  return { ...placed, fontSize };
}

/**
 * The bands of every edge exit of a view, in the order of `exits`. Each band
 * keeps off the bands placed before it, as it keeps off the party's tile.
 * On a narrow canvas an east band and a south band both clamp toward the
 * same corner, and without this they draw one over the other. The renderer
 * and the pointer both place bands here, so a click lands on the band the
 * GM sees.
 * @param {MapNode} node
 * @param {ExitBandView} view
 * @param {number} tileSize
 * @param {MapExit[]} exits
 * @returns {{ exit: MapExit, band: ExitBand }[]}
 */
export function edgeExitBands(node, view, tileSize, exits) {
  /** @type {{ exit: MapExit, band: ExitBand }[]} */
  const placed = [];
  for (const exit of exits) {
    if (exit.kind !== 'edge') continue;
    const geom = exitBandGeometry(node, view, tileSize, exit);
    const others = placed.map(({ band: b }) => ({ x: b.x, y: b.y, w: b.w, h: b.h }));
    const band = edgeExitBand(exit, {
      ...geom,
      occluders: [...(geom.occluders ?? []), ...others],
      required: [...(geom.required ?? []), ...others],
    });
    placed.push({ exit, band });
  }
  return placed;
}

/**
 * The room a north or south exit band takes beyond the room for the
 * coordinate labels, at the smallest band height, in buffer px. A fit keeps
 * this much room, so the band sits beside the map rather than over it.
 * @param {number} [pixelRatio]
 * @returns {number}
 */
export function exitBandDepth(pixelRatio = 1) {
  return 26 * pixelRatio;
}

/**
 * The distance from the map edge to the far side of its coordinate digits
 * and the clear space past them, in buffer px, or 0 when no digits draw. A
 * north band sits past the column digits and a west band past the row
 * digits, so the band never hides the coordinate of its own column or row.
 * @param {ExitBandGeometry} geom
 * @param {ExitSide} side
 */
function labelGap(geom, side) {
  if (side !== 'north' && side !== 'west') return 0;
  const layout = coordLabelLayout({ ...geom, node: geom, occluders: geom.chrome }, geom.tileSize);
  if (!layout) return 0;
  const { columns, rows } = layout;
  if (side === 'north') return columns ? geom.offsetY - columns.y + BAND_INSET : 0;
  return rows ? geom.offsetX - rows.x + BAND_INSET : 0;
}

/**
 * Keep one coordinate of a band on the canvas, `BAND_INSET` from each edge.
 * @param {number} p
 * @param {number} size band extent on that axis
 * @param {number} canvasSize
 */
function clampToCanvas(p, size, canvasSize) {
  return clamp(p, BAND_INSET, Math.max(BAND_INSET, canvasSize - size - BAND_INSET));
}

/**
 * Whether two rects overlap, with `BAND_INSET` of clear space required
 * between them.
 * @param {Rect} a
 * @param {Rect} b
 */
function overlaps(a, b) {
  return (
    a.x < b.x + b.w + BAND_INSET &&
    b.x < a.x + a.w + BAND_INSET &&
    a.y < b.y + b.h + BAND_INSET &&
    b.y < a.y + a.h + BAND_INSET
  );
}

/**
 * Move a band off the HTML that sits over the canvas, such as the mini-map.
 * A click on that HTML never reaches the canvas, so a band under it can be
 * seen in part but not clicked. The band slides along its own side, which
 * keeps it beside the border it leads off. Each occluder offers two places,
 * one just before it and one just past it on that axis. The band takes the
 * nearest place that is on the canvas and clear of every occluder.
 *
 * A coordinate strip runs the whole length of a side, so no slide clears it.
 * When no slide is clear, the band tries the places just before and just
 * past each occluder on the other axis. A north band then drops below the
 * column digits when the canvas has no room above them. A band nearly as
 * wide as a phone canvas crosses the row digits wherever it goes, so when no
 * place is clear, the band tries again with only the `required` rects: the
 * HTML over the canvas and the party's tile. That keeps it off the token at
 * the cost of some digits. When no place is clear even then, the band stays
 * where it is. This is a pure function.
 * @param {Rect} band
 * @param {ExitSide} side
 * @param {ExitBandGeometry} geom
 * @returns {Rect}
 */
export function avoidOccluders(band, side, geom) {
  const occluders = geom.occluders ?? [];
  if (!occluders.some((o) => overlaps(band, o))) return band;
  const horizontal = sideAxis(side) === 'x';
  const clear = (/** @type {ExitBandGeometry} */ g) =>
    nearestClear(band, horizontal, g) ?? nearestClear(band, !horizontal, g);
  const required = geom.required ?? [];
  if (!required.some((o) => overlaps(band, o))) return clear(geom) ?? band;
  return clear(geom) ?? clear({ ...geom, occluders: required }) ?? band;
}

/**
 * The nearest place for a band, moved along one axis only, that is on the
 * canvas and clear of every occluder, or null when there is none.
 * @param {Rect} band
 * @param {boolean} alongX true to move the band on the x axis
 * @param {ExitBandGeometry} geom
 * @returns {Rect | null}
 */
function nearestClear(band, alongX, geom) {
  const occluders = geom.occluders ?? [];
  /** @type {Rect | null} */
  let best = null;
  for (const o of occluders) {
    const places = alongX
      ? [o.x - band.w - BAND_INSET, o.x + o.w + BAND_INSET].map((x) => ({
          ...band,
          x: clampToCanvas(x, band.w, geom.canvasWidth),
        }))
      : [o.y - band.h - BAND_INSET, o.y + o.h + BAND_INSET].map((y) => ({
          ...band,
          y: clampToCanvas(y, band.h, geom.canvasHeight),
        }));
    for (const place of places) {
      if (occluders.some((other) => overlaps(place, other))) continue;
      const shift = Math.abs(place.x - band.x) + Math.abs(place.y - band.y);
      if (!best || shift < Math.abs(best.x - band.x) + Math.abs(best.y - band.y)) best = place;
    }
  }
  return best;
}

/**
 * Whether a buffer-space point falls inside an exit's band.
 * @param {MapExit} exit
 * @param {ExitBandGeometry} geom
 * @param {number} bufferX
 * @param {number} bufferY
 * @returns {boolean}
 */
export function hitExitBand(exit, geom, bufferX, bufferY) {
  return insideBand(edgeExitBand(exit, geom), bufferX, bufferY);
}

/**
 * Whether a buffer-space point falls inside a band rect.
 * @param {Rect} band
 * @param {number} bufferX
 * @param {number} bufferY
 * @returns {boolean}
 */
export function insideBand(band, bufferX, bufferY) {
  return (
    bufferX >= band.x &&
    bufferX <= band.x + band.w &&
    bufferY >= band.y &&
    bufferY <= band.y + band.h
  );
}

/** @param {ExitBandGeometry} geom @param {ExitSide} side @returns {number} */
function sideLength(geom, side) {
  return sideAxis(side) === 'x' ? geom.width : geom.height;
}
