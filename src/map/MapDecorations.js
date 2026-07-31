import { parseCoords, tileRect } from './MapGeometry.js';
import { EXIT_SIDES, edgeExitBand, exitBandGeometry, exitLabel } from './MapExits.js';

/** @typedef {import('./MapRenderer.js').MapRenderer} MapRenderer */
/** @typedef {import('./MapRenderer.js').MapView} MapView */
/** @typedef {import('../types/map.js').MapExit} MapExit */
/** @typedef {import('./MapExits.js').ExitBand} ExitBand */

/**
 * The decoration layer of the map render: interaction chrome (keyboard cursor,
 * region-tool marquee, Build selection outline), the POI glow, and the edge
 * coordinate labels. Split out of MapRenderer so the renderer keeps the
 * terrain/fog/region passes; this layer reads the host's ctx and tileSize and
 * draws over the finished tiles.
 */
export class MapDecorations {
  /** @param {MapRenderer} host */
  constructor(host) {
    this.host = host;
  }

  /**
   * Draw column (x) numbers above the top row and row (y) numbers left of the
   * first column, so a GM can read a tile's coordinate off the grid. Labels
   * hang off the grid edge and pan with it, but once the edge scrolls out of
   * the viewport (zoomed/panned in) they pin to the viewport edge at partial
   * opacity, over a translucent backing, so coordinates stay readable over
   * map art. Skipped when tiles are too small to label without clutter.
   * @param {MapView} view
   */
  renderCoordinates(view) {
    if (!view.node) return;
    const size = this.host.tileSize * view.scale;
    if (size < 20) return; // too dense to be legible
    const { ctx } = this.host;
    ctx.save();
    // Font is in buffer pixels, which are devicePixelRatio-times denser than CSS
    // pixels, so a small cap renders illegibly on a HiDPI canvas. Scale with the
    // tile and only cap generously.
    const fontSize = Math.round(Math.max(14, Math.min(size * 0.3, 42)));
    ctx.font = `600 ${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const pad = fontSize * 0.9;
    const colPinned = view.offsetY - pad < pad;
    const colY = colPinned ? pad : view.offsetY - pad;
    const rowPinned = view.offsetX - pad < pad;
    const rowX = rowPinned ? pad : view.offsetX - pad;
    for (let x = 0; x < view.node.width; x++) {
      const cx = view.offsetX + (x + 0.5) * size;
      if (cx < 0 || cx > view.canvasWidth) continue;
      this._drawCoordLabel(String(x), cx, colY, fontSize, colPinned);
    }
    for (let y = 0; y < view.node.height; y++) {
      const cy = view.offsetY + (y + 0.5) * size;
      if (cy < 0 || cy > view.canvasHeight) continue;
      this._drawCoordLabel(String(y), rowX, cy, fontSize, rowPinned);
    }
    ctx.restore();
  }

  /**
   * Draw one coordinate number. Pinned labels sit over map art, so they get a
   * translucent dark pill behind the digits and render at reduced opacity;
   * unpinned labels float on the empty canvas around the grid and need neither.
   * @param {string} text
   * @param {number} x
   * @param {number} y
   * @param {number} fontSize
   * @param {boolean} pinned
   */
  _drawCoordLabel(text, x, y, fontSize, pinned) {
    const { ctx } = this.host;
    if (pinned) {
      ctx.globalAlpha = 0.65;
      const w = ctx.measureText(text).width + fontSize * 0.5;
      const h = fontSize * 1.2;
      ctx.fillStyle = 'rgba(20, 16, 10, 0.7)';
      ctx.beginPath();
      ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 4);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(230, 215, 180, 0.8)';
    ctx.fillText(text, x, y);
    if (pinned) ctx.globalAlpha = 1;
  }

  /**
   * Draw an arrow in the gutter beside each side of the map the party can walk
   * off to get back to the parent node, labelled with where it leads. The band's
   * rect comes from MapExits, which the pointer hit-tests against the same way,
   * so the arrow is exactly as large as the thing that can be clicked — a
   * deliberately bounded pill rather than a whole side of the map, which would
   * swallow every click that missed the grid.
   *
   * Each band tracks the party along its side and clamps to the viewport, so
   * zooming in until the map's border scrolls away leaves the arrow pinned at
   * the canvas edge rather than scrolling off with it.
   * @param {MapView} view
   */
  renderEdgeExits(view) {
    const node = view.node;
    if (!node || !view.exits?.length) return;
    for (const exit of view.exits) {
      if (exit.kind !== 'edge') continue;
      const dir = EXIT_SIDES.find((s) => s.side === exit.side);
      if (!dir) continue;
      const geom = exitBandGeometry(node, view, this.host.tileSize, exit);
      this._drawExitBand(exit, edgeExitBand(exit, geom), dir.dx, dir.dy);
    }
  }

  /**
   * One return arrow: a parchment-bordered pill carrying an outward chevron and
   * the exit's label. The label is clipped to the pill, so a long region name
   * cannot spill past the area that answers a click.
   * @param {MapExit} exit
   * @param {ExitBand} band
   * @param {number} dx direction the exit leads, in grid cells
   * @param {number} dy
   */
  _drawExitBand(exit, band, dx, dy) {
    const { ctx } = this.host;
    const { x, y, w, h, fontSize } = band;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, Math.min(h / 2, 14));
    ctx.fillStyle = 'rgba(20, 16, 10, 0.86)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(230, 215, 180, 0.85)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.clip();

    // The chevron takes the end of the pill the exit leads towards, so an east
    // exit reads left-to-right into its arrow and a west exit out of it.
    const lane = fontSize * 1.6;
    const chevronX = dx > 0 ? x + w - lane / 2 : x + lane / 2;
    const textX = dx > 0 ? x + (w - lane) / 2 : x + lane + (w - lane) / 2;
    this._drawChevron(chevronX, y + h / 2, fontSize * 0.42, dx, dy);

    ctx.font = `600 ${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f2e4bd';
    ctx.fillText(exitLabel(exit), textX, y + h / 2 + 1);
    ctx.restore();
  }

  /**
   * A chevron pointing the way an exit leads, centred on a point.
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
    ctx.strokeStyle = '#ffd24a';
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
   * Outline a discovered point-of-interest tile with a glowing gold border, so
   * it reads as special against surrounding terrain. Called per tile from the
   * renderer's tile loop rather than as an overlay pass, so it sits directly
   * on the tile.
   * @param {number} sx
   * @param {number} sy
   * @param {number} size
   */
  renderPoiOutline(sx, sy, size) {
    const { ctx } = this.host;
    ctx.save();
    ctx.strokeStyle = '#ffd24a';
    ctx.lineWidth = Math.max(2, size * 0.06);
    ctx.shadowColor = 'rgba(255, 190, 60, 0.9)';
    ctx.shadowBlur = size * 0.18;
    const inset = ctx.lineWidth / 2 + 1;
    ctx.strokeRect(sx + inset, sy + inset, size - inset * 2, size - inset * 2);
    ctx.restore();
  }

  /** Draw the keyboard cursor cell while the canvas is focused, distinct from
   * the Build selection (solid gold) and party marker (dot).
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
    ctx.strokeStyle = '#5ec8ff';
    ctx.lineWidth = 3;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(sx + 1.5, sy + 1.5, size - 3, size - 3);
    ctx.restore();
  }

  /** Dashed outline + tint over the region tool's in-progress drag block.
   * @param {MapView} view */
  renderMarquee(view) {
    if (!view.marquee) return;
    const { ctx, tileSize } = this.host;
    const topLeft = tileRect(
      view.marquee.minX,
      view.marquee.minY,
      tileSize,
      view.offsetX,
      view.offsetY,
      view.scale,
    );
    const bottomRight = tileRect(
      view.marquee.maxX,
      view.marquee.maxY,
      tileSize,
      view.offsetX,
      view.offsetY,
      view.scale,
    );
    const w = bottomRight.sx + bottomRight.size - topLeft.sx;
    const h = bottomRight.sy + bottomRight.size - topLeft.sy;
    ctx.save();
    ctx.fillStyle = 'rgba(224, 193, 75, 0.18)';
    ctx.fillRect(topLeft.sx, topLeft.sy, w, h);
    ctx.strokeStyle = '#e0c14b';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(topLeft.sx + 1, topLeft.sy + 1, w - 2, h - 2);
    ctx.restore();
  }

  /** Outline the Build-mode selected tile so the GM sees which tile the
   * inspector and palette act on.
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
    ctx.strokeStyle = '#e0c14b';
    ctx.lineWidth = 3;
    ctx.strokeRect(sx + 1.5, sy + 1.5, size - 3, size - 3);
    ctx.restore();
  }
}
