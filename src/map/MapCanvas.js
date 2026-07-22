import { findRegionGroups } from './RegionGroups.js';

/** @typedef {import('../types/map.js').MapNode} MapNode */
/** @typedef {import('../types/map.js').Tile} Tile */
/** @typedef {import('./TilePalette.js').TilePalette} TilePalette */
/** @typedef {import('./RegionGroups.js').RegionGroup} RegionGroup */

/**
 * Grid tiles use "x,y" as their id (e.g. "3,4"), giving MapCanvas a coordinate
 * without adding position fields to the Tile type. Non-grid tiles (hierarchy
 * tests, etc.) are free to use any other id shape.
 * @param {string} id
 * @returns {{ x: number, y: number } | null}
 */
export function parseCoords(id) {
  const match = /^(\d+),(\d+)$/.exec(id);
  if (!match) return null;
  return { x: Number(match[1]), y: Number(match[2]) };
}

/**
 * Screen-space rect for a tile at grid position (x, y) given the current
 * pan offset and zoom scale.
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
 * Inverse of tileRect: which grid cell contains a given screen point.
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
 * Clamp a zoom scale to a min/max range.
 * @param {number} scale
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clampZoom(scale, min, max) {
  return Math.min(max, Math.max(min, scale));
}

/**
 * Convert a client (viewport) point to the canvas's internal buffer-pixel
 * space. A canvas can be rendered at a different CSS size than its internal
 * pixel buffer (e.g. `max-width: 100%` shrinks the element while `width`/
 * `height` attributes fix the buffer); `getBoundingClientRect()` alone gives
 * CSS-space coordinates, so all buffer-space tile math must first scale by the
 * buffer/CSS ratio or every click, drag, and zoom anchor is silently offset.
 * @param {number} clientX
 * @param {number} clientY
 * @param {DOMRect} rect result of canvas.getBoundingClientRect()
 * @param {number} bufferWidth canvas.width
 * @param {number} bufferHeight canvas.height
 * @returns {{ x: number, y: number, scaleX: number, scaleY: number }}
 */
export function clientToBuffer(clientX, clientY, rect, bufferWidth, bufferHeight) {
  const scaleX = rect.width === 0 ? 1 : bufferWidth / rect.width;
  const scaleY = rect.height === 0 ? 1 : bufferHeight / rect.height;
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
    scaleX,
    scaleY,
  };
}

/**
 * Renders a MapNode's tile grid onto a canvas, with mouse-drag pan and
 * wheel zoom. Unrevealed tiles draw as a flat fog rect instead of their
 * imageRef, matching the fog-of-war model on Tile.revealed.
 */
export class MapCanvas {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {TilePalette} palette
   * @param {{ tileSize?: number, minZoom?: number, maxZoom?: number, onCellClick?: (x: number, y: number, tile: Tile | null) => void, getNodeName?: (nodeId: string) => string | undefined }} [options]
   */
  constructor(canvas, palette, options = {}) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('MapCanvas requires a 2d canvas context');
    this.ctx = ctx;
    this.palette = palette;
    this.tileSize = options.tileSize ?? 48;
    this.minZoom = options.minZoom ?? 0.25;
    this.maxZoom = options.maxZoom ?? 4;
    this.onCellClick = options.onCellClick;
    this.getNodeName = options.getNodeName;

    /** @type {MapNode | null} */
    this.node = null;
    /** @type {RegionGroup[]} */
    this.regionGroups = [];
    /** @type {string | null} tile id of the party marker within the current node, if any */
    this.partyTileId = null;
    /** @type {string | null} tile id highlighted as the Build-mode selection, if any */
    this.selectedTileId = null;
    /** When true (Build mode), draw every tile's image regardless of its
     * revealed flag, so a GM authors against the whole map, not through fog. */
    this.revealAll = false;
    this.offsetX = 0;
    this.offsetY = 0;
    this.scale = 1;

    /** @type {Map<string, HTMLImageElement>} */
    this.imageCache = new Map();

    this._dragging = false;
    this._lastX = 0;
    this._lastY = 0;
    this._dragDistance = 0;

    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._onWheel = this._onWheel.bind(this);

    canvas.addEventListener('pointerdown', this._onPointerDown);
    canvas.addEventListener('pointermove', this._onPointerMove);
    canvas.addEventListener('pointerup', this._onPointerUp);
    canvas.addEventListener('pointerleave', this._onPointerUp);
    canvas.addEventListener('wheel', this._onWheel, { passive: false });
  }

  /**
   * Load a new MapNode, resetting pan/zoom.
   * @param {MapNode} node
   */
  setNode(node) {
    this.node = node;
    this.regionGroups = findRegionGroups(node);
    this.partyTileId = null;
    this.selectedTileId = null;
    this.offsetX = 0;
    this.offsetY = 0;
    this.scale = 1;
    this.render();
  }

  /**
   * Swap in an updated copy of the *same* node (e.g. after a tile mutation
   * like a fog reveal) without resetting pan/zoom, unlike setNode.
   * @param {MapNode} node
   */
  refreshNode(node) {
    this.node = node;
    this.regionGroups = findRegionGroups(node);
    this.render();
  }

  /**
   * Show (or clear, with null) the party marker at a tile id within the
   * current node. Does not reset pan/zoom, unlike setNode.
   * @param {string | null} tileId
   */
  setPartyTile(tileId) {
    this.partyTileId = tileId;
    this.render();
  }

  /**
   * Highlight (or clear, with null) the Build-mode selected tile. Independent
   * of the party marker, so a GM can inspect any tile without moving the party.
   * @param {string | null} tileId
   */
  setSelectedTile(tileId) {
    this.selectedTileId = tileId;
    this.render();
  }

  /**
   * Toggle whether unrevealed tiles are drawn as fog (false, Play) or fully
   * (true, Build).
   * @param {boolean} value
   */
  setRevealAll(value) {
    this.revealAll = value;
    this.render();
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
      img.onload = () => this.render();
      this.imageCache.set(imageRef, img);
    }
    return img;
  }

  render() {
    const { ctx, canvas, node } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!node) return;

    this._renderMapBounds();

    for (const tile of node.tiles) {
      const coords = parseCoords(tile.id);
      if (!coords) continue;
      const { sx, sy, size } = tileRect(coords.x, coords.y, this.tileSize, this.offsetX, this.offsetY, this.scale);
      if (sx + size < 0 || sy + size < 0 || sx > canvas.width || sy > canvas.height) continue;

      if (!tile.revealed && !this.revealAll) {
        // A distinctly lighter fill than the map backdrop and the empty-canvas
        // background, so an unexplored-but-real tile reads as fog, not void.
        ctx.fillStyle = '#48412f';
        ctx.fillRect(sx, sy, size, size);
        continue;
      }

      const img = this._getImage(tile.imageRef);
      if (img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, sx, sy, size, size);
      } else {
        ctx.fillStyle = '#333';
        ctx.fillRect(sx, sy, size, size);
      }
    }

    this._renderRegionGroups();
    this._renderSelection();
    this._renderPartyMarker();
    this._renderMapBoundsBorder();
  }

  /** Outline the Build-mode selected tile so the GM sees which tile the
   * inspector and palette act on. */
  _renderSelection() {
    if (!this.selectedTileId) return;
    const coords = parseCoords(this.selectedTileId);
    if (!coords) return;
    const { ctx } = this;
    const { sx, sy, size } = tileRect(coords.x, coords.y, this.tileSize, this.offsetX, this.offsetY, this.scale);
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
   */
  _renderMapBounds() {
    const { ctx, node } = this;
    if (!node) return;
    const size = this.tileSize * this.scale;
    ctx.fillStyle = '#241f16';
    ctx.fillRect(this.offsetX, this.offsetY, node.width * size, node.height * size);
  }

  /** Stroke the node extent after tiles so the world edge is always visible. */
  _renderMapBoundsBorder() {
    const { ctx, node } = this;
    if (!node) return;
    const size = this.tileSize * this.scale;
    ctx.save();
    ctx.strokeStyle = 'rgba(230, 215, 180, 0.55)';
    ctx.lineWidth = 2;
    ctx.strokeRect(this.offsetX, this.offsetY, node.width * size, node.height * size);
    ctx.restore();
  }

  _renderPartyMarker() {
    if (!this.partyTileId) return;
    const coords = parseCoords(this.partyTileId);
    if (!coords) return;
    const { ctx } = this;
    const { sx, sy, size } = tileRect(coords.x, coords.y, this.tileSize, this.offsetX, this.offsetY, this.scale);

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

  _renderRegionGroups() {
    const { ctx, canvas } = this;
    for (const group of this.regionGroups) {
      const topLeft = tileRect(group.minX, group.minY, this.tileSize, this.offsetX, this.offsetY, this.scale);
      const bottomRight = tileRect(group.maxX, group.maxY, this.tileSize, this.offsetX, this.offsetY, this.scale);
      const x = topLeft.sx;
      const y = topLeft.sy;
      const w = bottomRight.sx + bottomRight.size - topLeft.sx;
      const h = bottomRight.sy + bottomRight.size - topLeft.sy;
      if (x + w < 0 || y + h < 0 || x > canvas.width || y > canvas.height) continue;

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

  /** @param {PointerEvent} event */
  _onPointerDown(event) {
    this._dragging = true;
    this._dragDistance = 0;
    this._lastX = event.clientX;
    this._lastY = event.clientY;
  }

  /** @param {PointerEvent} event */
  _onPointerMove(event) {
    if (!this._dragging) return;
    // Drag deltas are measured in client (CSS) px but pan offsets live in
    // buffer px, so scale the delta by the buffer/CSS ratio.
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = rect.width === 0 ? 1 : this.canvas.width / rect.width;
    const scaleY = rect.height === 0 ? 1 : this.canvas.height / rect.height;
    const dx = (event.clientX - this._lastX) * scaleX;
    const dy = (event.clientY - this._lastY) * scaleY;
    this.offsetX += dx;
    this.offsetY += dy;
    this._dragDistance += Math.abs(dx) + Math.abs(dy);
    this._lastX = event.clientX;
    this._lastY = event.clientY;
    this.render();
  }

  /** @param {PointerEvent} event */
  _onPointerUp(event) {
    const wasClick = this._dragging && this._dragDistance < 4;
    this._dragging = false;
    if (!wasClick || !this.onCellClick || !this.node) return;

    const rect = this.canvas.getBoundingClientRect();
    const buffer = clientToBuffer(event.clientX, event.clientY, rect, this.canvas.width, this.canvas.height);
    const coords = screenToTile(
      buffer.x,
      buffer.y,
      this.tileSize,
      this.offsetX,
      this.offsetY,
      this.scale,
    );
    // Fire for any in-bounds cell, whether or not a tile currently sits there,
    // so Build mode can paint into an empty (e.g. just-erased) cell. The
    // handler gets the tile if one exists, or null.
    if (coords.x < 0 || coords.y < 0 || coords.x >= this.node.width || coords.y >= this.node.height) return;
    const tile = this.node.tiles.find((t) => t.id === `${coords.x},${coords.y}`) ?? null;
    this.onCellClick(coords.x, coords.y, tile);
  }

  /** @param {WheelEvent} event */
  _onWheel(event) {
    event.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const buffer = clientToBuffer(event.clientX, event.clientY, rect, this.canvas.width, this.canvas.height);
    const pointerX = buffer.x;
    const pointerY = buffer.y;

    const before = screenToTile(pointerX, pointerY, this.tileSize, this.offsetX, this.offsetY, this.scale);
    const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
    this.scale = clampZoom(this.scale * factor, this.minZoom, this.maxZoom);

    const afterRect = tileRect(before.x, before.y, this.tileSize, this.offsetX, this.offsetY, this.scale);
    this.offsetX += pointerX - afterRect.sx;
    this.offsetY += pointerY - afterRect.sy;

    this.render();
  }

  destroy() {
    this.canvas.removeEventListener('pointerdown', this._onPointerDown);
    this.canvas.removeEventListener('pointermove', this._onPointerMove);
    this.canvas.removeEventListener('pointerup', this._onPointerUp);
    this.canvas.removeEventListener('pointerleave', this._onPointerUp);
    this.canvas.removeEventListener('wheel', this._onWheel);
  }
}
