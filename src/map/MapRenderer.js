import { parseCoords, tileRect } from './MapGeometry.js';

/** @typedef {import('../types/map.js').MapNode} MapNode */
/** @typedef {import('./RegionGroups.js').RegionGroup} RegionGroup */

/**
 * A snapshot of everything the renderer needs to draw a frame. MapCanvas owns
 * this state (pan/zoom, current node, selection/party/cursor ids, mode flags)
 * and hands a fresh view to the renderer on every draw, so the renderer holds
 * no map state of its own beyond its image cache.
 * @typedef {Object} MapView
 * @property {number} canvasWidth
 * @property {number} canvasHeight
 * @property {MapNode | null} node
 * @property {RegionGroup[]} regionGroups
 * @property {number} offsetX
 * @property {number} offsetY
 * @property {number} scale
 * @property {boolean} revealAll draw every tile's image regardless of fog (Build mode)
 * @property {string | null} partyTileId
 * @property {string | null} selectedTileId
 * @property {string | null} cursorCellId
 * @property {boolean} focused whether the keyboard cursor outline shows
 * @property {import('./TilePaint.js').CellRect | null} marquee
 */

/**
 * Draws a MapNode's tile grid, fog, region overlays, and the party/selection/
 * cursor decorations onto a 2d context. Pure "draw from a view snapshot": it
 * reads a MapView and paints, keeping no pan/zoom or selection state itself, so
 * MapCanvas stays the single owner of interaction state. The one piece of
 * mutable state it keeps is an image cache; a freshly-loaded image calls back
 * so the canvas can re-render once the bytes arrive.
 */
export class MapRenderer {
  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {{ tileSize: number, getNodeName?: (nodeId: string) => string | undefined, onImageLoad?: () => void }} options
   */
  constructor(ctx, options) {
    this.ctx = ctx;
    this.tileSize = options.tileSize;
    this.getNodeName = options.getNodeName;
    this.onImageLoad = options.onImageLoad;
    /** @type {Map<string, HTMLImageElement>} */
    this.imageCache = new Map();
  }

  /**
   * @param {string} imageRef
   * @returns {HTMLImageElement}
   */
  _getImage(imageRef) {
    let img = this.imageCache.get(imageRef);
    if (!img) {
      img = new Image();
      img.src = `/${imageRef}`;
      img.onload = () => this.onImageLoad?.();
      this.imageCache.set(imageRef, img);
    }
    return img;
  }

  /**
   * Draw one frame of the map from a view snapshot.
   * @param {MapView} view
   */
  render(view) {
    const { ctx } = this;
    ctx.clearRect(0, 0, view.canvasWidth, view.canvasHeight);
    if (!view.node) return;

    this._renderMapBounds(view);
    this._renderTiles(view);
    this._renderRegionGroups(view);
    this._renderMarquee(view);
    this._renderSelection(view);
    this._renderPartyMarker(view);
    this._renderCursor(view);
    this._renderMapBoundsBorder(view);
    this._renderCoordinates(view);
  }

  /**
   * Draw column (x) numbers above the top row and row (y) numbers left of the
   * first column, so a GM can read a tile's coordinate off the grid. Labels
   * hang off the grid edge and pan with it. Skipped when tiles are too small to
   * label without clutter.
   * @param {MapView} view
   */
  _renderCoordinates(view) {
    if (!view.node) return;
    const size = this.tileSize * view.scale;
    if (size < 20) return; // too dense to be legible
    const { ctx } = this;
    ctx.save();
    ctx.fillStyle = 'rgba(230, 215, 180, 0.8)';
    // Font is in buffer pixels, which are devicePixelRatio-times denser than CSS
    // pixels, so a small cap renders illegibly on a HiDPI canvas. Scale with the
    // tile and only cap generously.
    const fontSize = Math.round(Math.max(14, Math.min(size * 0.3, 42)));
    ctx.font = `600 ${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const pad = fontSize * 0.9;
    for (let x = 0; x < view.node.width; x++) {
      const cx = view.offsetX + (x + 0.5) * size;
      if (cx < 0 || cx > view.canvasWidth) continue;
      ctx.fillText(String(x), cx, view.offsetY - pad);
    }
    for (let y = 0; y < view.node.height; y++) {
      const cy = view.offsetY + (y + 0.5) * size;
      if (cy < 0 || cy > view.canvasHeight) continue;
      ctx.fillText(String(y), view.offsetX - pad, cy);
    }
    ctx.restore();
  }

  /**
   * Draw every in-view tile: fog rect when unrevealed (outside Build mode), the
   * base terrain image, any path/road overlay on top, and a POI outline.
   * @param {MapView} view
   */
  _renderTiles(view) {
    const { ctx } = this;
    const node = view.node;
    if (!node) return;
    for (const tile of node.tiles) {
      const coords = parseCoords(tile.id);
      if (!coords) continue;
      const { sx, sy, size } = tileRect(coords.x, coords.y, this.tileSize, view.offsetX, view.offsetY, view.scale);
      if (sx + size < 0 || sy + size < 0 || sx > view.canvasWidth || sy > view.canvasHeight) continue;

      if (!tile.revealed && !view.revealAll) {
        // A distinctly lighter fill than the map backdrop and the empty-canvas
        // background, so an unexplored-but-real tile reads as fog, not void.
        ctx.fillStyle = '#48412f';
        ctx.fillRect(sx, sy, size, size);
        continue;
      }

      // A tile carrying only an overlay (a path on an as-yet-unpainted cell)
      // has an empty base, so let the map backdrop show through rather than
      // drawing a placeholder under the path.
      if (tile.imageRef) {
        const img = this._getImage(tile.imageRef);
        if (img.complete && img.naturalWidth > 0) {
          ctx.drawImage(img, sx, sy, size, size);
        } else {
          ctx.fillStyle = '#333';
          ctx.fillRect(sx, sy, size, size);
        }
      }

      // A path/road overlay draws on top of the base terrain, so a road can sit
      // on sand, snow, etc. rather than replacing the tile beneath it.
      if (tile.overlayRef) {
        const overlay = this._getImage(tile.overlayRef);
        if (overlay.complete && overlay.naturalWidth > 0) {
          ctx.drawImage(overlay, sx, sy, size, size);
        }
      }

      // A drawn tile carrying a POI type gets a prominent outline. A POI marked
      // discoverable stays hidden until the party reaches it (unless authoring,
      // where the GM sees everything), so secret sites aren't given away by fog
      // reveal alone.
      const poiVisible =
        tile.metadata.poiType &&
        (view.revealAll || !tile.metadata.discoverable || tile.metadata.discovered);
      if (poiVisible) this._renderPoiOutline(sx, sy, size);
    }
  }

  /**
   * Outline a discovered point-of-interest tile with a glowing gold border, so
   * it reads as special against surrounding terrain. Drawn per tile inside the
   * tile loop rather than as an overlay pass, so it sits directly on the tile.
   * @param {number} sx
   * @param {number} sy
   * @param {number} size
   */
  _renderPoiOutline(sx, sy, size) {
    const { ctx } = this;
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
  _renderCursor(view) {
    if (!view.focused || !view.cursorCellId) return;
    const coords = parseCoords(view.cursorCellId);
    if (!coords) return;
    const { ctx } = this;
    const { sx, sy, size } = tileRect(coords.x, coords.y, this.tileSize, view.offsetX, view.offsetY, view.scale);
    ctx.save();
    ctx.strokeStyle = '#5ec8ff';
    ctx.lineWidth = 3;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(sx + 1.5, sy + 1.5, size - 3, size - 3);
    ctx.restore();
  }

  /** Dashed outline + tint over the region tool's in-progress drag block.
   * @param {MapView} view */
  _renderMarquee(view) {
    if (!view.marquee) return;
    const { ctx } = this;
    const topLeft = tileRect(view.marquee.minX, view.marquee.minY, this.tileSize, view.offsetX, view.offsetY, view.scale);
    const bottomRight = tileRect(view.marquee.maxX, view.marquee.maxY, this.tileSize, view.offsetX, view.offsetY, view.scale);
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
  _renderSelection(view) {
    if (!view.selectedTileId) return;
    const coords = parseCoords(view.selectedTileId);
    if (!coords) return;
    const { ctx } = this;
    const { sx, sy, size } = tileRect(coords.x, coords.y, this.tileSize, view.offsetX, view.offsetY, view.scale);
    ctx.save();
    ctx.strokeStyle = '#e0c14b';
    ctx.lineWidth = 3;
    ctx.strokeRect(sx + 1.5, sy + 1.5, size - 3, size - 3);
    ctx.restore();
  }

  /**
   * Fill the node's full width x height extent with a map-area backdrop, drawn
   * before the tiles. This gives the map a definite shape even where no tile is
   * revealed, so panning past the edge is visually obvious.
   * @param {MapView} view
   */
  _renderMapBounds(view) {
    const { ctx } = this;
    if (!view.node) return;
    const size = this.tileSize * view.scale;
    ctx.fillStyle = '#241f16';
    ctx.fillRect(view.offsetX, view.offsetY, view.node.width * size, view.node.height * size);
  }

  /** Stroke the node extent after tiles so the world edge is always visible.
   * @param {MapView} view */
  _renderMapBoundsBorder(view) {
    const { ctx } = this;
    if (!view.node) return;
    const size = this.tileSize * view.scale;
    ctx.save();
    ctx.strokeStyle = 'rgba(230, 215, 180, 0.55)';
    ctx.lineWidth = 2;
    ctx.strokeRect(view.offsetX, view.offsetY, view.node.width * size, view.node.height * size);
    ctx.restore();
  }

  /** @param {MapView} view */
  _renderPartyMarker(view) {
    if (!view.partyTileId) return;
    const coords = parseCoords(view.partyTileId);
    if (!coords) return;
    const { ctx } = this;
    const { sx, sy, size } = tileRect(coords.x, coords.y, this.tileSize, view.offsetX, view.offsetY, view.scale);

    ctx.save();
    ctx.fillStyle = '#e0c14b';
    ctx.strokeStyle = '#3a2f0a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sx + size / 2, sy + size / 2, size * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  /** @param {MapView} view */
  _renderRegionGroups(view) {
    const { ctx } = this;
    // Outside Build mode, a region stays hidden until the party has discovered
    // at least one of its tiles through the fog, so the overworld doesn't
    // reveal where every unexplored region sits.
    const revealedIds = view.revealAll
      ? null
      : new Set((view.node?.tiles ?? []).filter((t) => t.revealed).map((t) => t.id));
    for (const group of view.regionGroups) {
      if (revealedIds && !group.tileIds.some((id) => revealedIds.has(id))) continue;
      const topLeft = tileRect(group.minX, group.minY, this.tileSize, view.offsetX, view.offsetY, view.scale);
      const bottomRight = tileRect(group.maxX, group.maxY, this.tileSize, view.offsetX, view.offsetY, view.scale);
      const x = topLeft.sx;
      const y = topLeft.sy;
      const w = bottomRight.sx + bottomRight.size - topLeft.sx;
      const h = bottomRight.sy + bottomRight.size - topLeft.sy;
      if (x + w < 0 || y + h < 0 || x > view.canvasWidth || y > view.canvasHeight) continue;

      ctx.save();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);

      const name = this.getNodeName?.(group.childNodeId);
      if (name) {
        ctx.font = '12px sans-serif';
        ctx.textBaseline = 'top';
        const label = ` ${name} `;
        const metrics = ctx.measureText(label);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(x, y, metrics.width, 16);
        ctx.fillStyle = '#fff';
        ctx.fillText(label, x, y + 2);
      }
      ctx.restore();
    }
  }
}
