import { parseCoords, tileRect } from './MapGeometry.js';
import { EXIT_SIDES, exitLabel } from './MapExits.js';
import { edgeExitBands } from './ExitBands.js';
import { INK } from './CanvasInk.js';
import { drawPlatedLabel } from './CanvasText.js';
import { coordLabelLayout, visibleCoordLabels } from './CoordLabels.js';
import { PoiGlow } from './PoiGlow.js';

/** @typedef {import('./MapRenderer.js').MapRenderer} MapRenderer */
/** @typedef {import('./MapRenderer.js').MapView} MapView */
/** @typedef {import('../types/map.js').MapExit} MapExit */
/** @typedef {import('./ExitBands.js').ExitBand} ExitBand */

/**
 * This class draws the decoration layer of the map render. It covers
 * interaction chrome (keyboard cursor, Build selection
 * outline), the point-of-interest glow, and the edge coordinate labels.
 * MapRenderer does not do this work directly, so the renderer keeps only the
 * terrain, fog, and region passes. This layer reads the host's ctx and
 * tileSize, and draws over the finished tiles.
 */
export class MapDecorations {
  /** @param {MapRenderer} host */
  constructor(host) {
    this.host = host;
    this._glow = new PoiGlow({ createCanvas: host.createCanvas });
  }

  /**
   * Draw column numbers above the top row, and row numbers left of the first
   * column, so a GM can read a tile's coordinate from the grid. The numbers
   * count from 1, the same as every coordinate the app prints or asks for.
   * The stored tile ids count from 0; `TileCoords.js` converts. Labels
   * hang off the grid edge and pan with it. Once the edge scrolls out of the
   * viewport, from a zoom or pan, the labels pin to the viewport edge at
   * partial opacity, over a translucent backing, so coordinates stay readable
   * over map art. This method skips labels when tiles are too small to label
   * without clutter.
   * @param {MapView} view
   */
  renderCoordinates(view) {
    // A null layout means tiles too small for legible digits.
    const layout = coordLabelLayout(view, this.host.tileSize);
    if (!view.node || !layout) return;
    const { fontSize, colY, rowX, colPinned, rowPinned } = layout;
    const { columns, rows } = visibleCoordLabels(view, layout);
    for (const c of columns) this._drawCoordLabel(c.text, c.x, colY, fontSize, colPinned);
    for (const r of rows) this._drawCoordLabel(r.text, rowX, r.y, fontSize, rowPinned);
  }

  /**
   * Draw one coordinate number. Pinned labels sit over map art, so they get a
   * translucent dark pill behind the digits, and draw at reduced opacity.
   * Unpinned labels float on the empty canvas around the grid and need neither.
   * @param {string} text
   * @param {number} x
   * @param {number} y
   * @param {number} fontSize
   * @param {boolean} pinned
   */
  _drawCoordLabel(text, x, y, fontSize, pinned) {
    drawPlatedLabel(this.host.ctx, text, x, y, {
      fontSize,
      color: INK.coordText,
      plate: pinned ? 'pill' : null,
      alpha: pinned ? 0.65 : 1,
    });
  }

  /**
   * Draw an arrow in the gutter beside each side of the map that the party can
   * walk off to reach the parent node, labeled with where it leads. The band's
   * rect comes from MapExits, and the pointer hit-tests against the same rect.
   * The arrow is exactly as large as the area that can be clicked: a bounded
   * pill by design, not a whole side of the map, which catches every click
   * that missed the grid.
   *
   * Each band tracks the party along its side and clamps to the viewport. When
   * a zoom scrolls the map's border out of view, the arrow stays pinned at the
   * canvas edge instead of scrolling away with the border.
   * @param {MapView} view
   */
  renderEdgeExits(view) {
    const node = view.node;
    if (!node || !view.exits?.length) return;
    for (const { exit, band } of edgeExitBands(node, view, this.host.tileSize, view.exits)) {
      const dir = EXIT_SIDES.find((s) => exit.kind === 'edge' && s.side === exit.side);
      if (!dir) continue;
      const armed = exit.kind === 'edge' && view.armedExitSide === exit.side;
      this._drawExitBand(exit, band, dir.dx, dir.dy, armed);
    }
  }

  /**
   * Draw one return arrow: a parchment-bordered pill carrying an outward
   * chevron and the exit's label. The label is clipped to the pill, so a long
   * region name cannot spill past the area that answers a click. An armed
   * band brightens to the chevron's gold. A band becomes armed when the
   * cursor first presses into this border. The same arrow again then leaves.
   * The brightening shows a sighted keyboard user the arming that the live
   * region narrates.
   * @param {MapExit} exit
   * @param {ExitBand} band
   * @param {number} dx direction the exit leads, in grid cells
   * @param {number} dy
   * @param {boolean} [armed]
   */
  _drawExitBand(exit, band, dx, dy, armed = false) {
    const { ctx } = this.host;
    const { x, y, w, h, fontSize } = band;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, Math.min(h / 2, 14));
    ctx.fillStyle = armed ? INK.bandFillArmed : INK.bandFill;
    ctx.fill();
    ctx.strokeStyle = armed ? INK.goldLit : INK.bandBorder;
    ctx.lineWidth = armed ? 3 : 2;
    ctx.stroke();
    ctx.clip();

    // The chevron takes the end of the pill that the exit leads toward. An
    // east exit reads left-to-right into its arrow, a west exit reads out of it.
    const lane = fontSize * 1.6;
    const chevronX = dx > 0 ? x + w - lane / 2 : x + lane / 2;
    const textX = dx > 0 ? x + (w - lane) / 2 : x + lane + (w - lane) / 2;
    this._drawChevron(chevronX, y + h / 2, fontSize * 0.42, dx, dy);

    // The band's own body is the label's plate, so the label draws bare.
    drawPlatedLabel(ctx, exitLabel(exit), textX, y + h / 2 + 1, { fontSize });
    ctx.restore();
  }

  /**
   * Draw a chevron pointing the way an exit leads, centered on a point.
   * @param {number} cx
   * @param {number} cy
   * @param {number} r arm length in buffer px
   * @param {number} dx
   * @param {number} dy
   */
  _drawChevron(cx, cy, r, dx, dy) {
    const { ctx } = this.host;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.atan2(dy, dx));
    ctx.strokeStyle = INK.goldLit;
    ctx.lineWidth = Math.max(2, r * 0.45);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(-r * 0.6, -r);
    ctx.lineTo(r * 0.6, 0);
    ctx.lineTo(-r * 0.6, r);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Draw a glowing gold border around a discovered point-of-interest tile, so
   * it reads as special against the surrounding terrain. The renderer's tile
   * loop calls this once per tile, not as a separate overlay pass, so the
   * border sits directly on the tile.
   * @param {number} sx
   * @param {number} sy
   * @param {number} size
   */
  renderPoiOutline(sx, sy, size) {
    this._glow.draw(this.host.ctx, sx, sy, size);
  }

  /** Draw the keyboard cursor cell while the canvas has focus. This is
   * distinct from the Build selection (solid gold) and party marker (dot).
   * @param {MapView} view */
  renderCursor(view) {
    if (!view.focused || !view.cursorCellId) return;
    const coords = parseCoords(view.cursorCellId);
    if (!coords) return;
    const { ctx } = this.host;
    const { sx, sy, size } = tileRect(
      coords.x,
      coords.y,
      this.host.tileSize,
      view.offsetX,
      view.offsetY,
      view.scale,
    );
    ctx.save();
    ctx.strokeStyle = INK.cursor;
    ctx.lineWidth = 3;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(sx + 1.5, sy + 1.5, size - 3, size - 3);
    ctx.restore();
  }

  /** Draw an outline around the Build-mode selected tile, so the GM sees
   * which tile the inspector and palette act on.
   * @param {MapView} view */
  renderSelection(view) {
    if (!view.selectedTileId) return;
    const coords = parseCoords(view.selectedTileId);
    if (!coords) return;
    const { ctx } = this.host;
    const { sx, sy, size } = tileRect(
      coords.x,
      coords.y,
      this.host.tileSize,
      view.offsetX,
      view.offsetY,
      view.scale,
    );
    ctx.save();
    ctx.strokeStyle = INK.gold;
    ctx.lineWidth = 3;
    ctx.strokeRect(sx + 1.5, sy + 1.5, size - 3, size - 3);
    ctx.restore();
  }
}
