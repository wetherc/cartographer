/** @typedef {import('../types/map.js').MapNode} MapNode */
/** @typedef {import('../types/map.js').Tile} Tile */
/** @typedef {import('./TilePalette.js').TilePalette} TilePalette */

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
 * Renders a MapNode's tile grid onto a canvas, with mouse-drag pan and
 * wheel zoom. Unrevealed tiles draw as a flat fog rect instead of their
 * imageRef, matching the fog-of-war model on Tile.revealed.
 */
export class MapCanvas {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {TilePalette} palette
   * @param {{ tileSize?: number, minZoom?: number, maxZoom?: number }} [options]
   */
  constructor(canvas, palette, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.palette = palette;
    this.tileSize = options.tileSize ?? 48;
    this.minZoom = options.minZoom ?? 0.25;
    this.maxZoom = options.maxZoom ?? 4;

    /** @type {MapNode | null} */
    this.node = null;
    this.offsetX = 0;
    this.offsetY = 0;
    this.scale = 1;

    /** @type {Map<string, HTMLImageElement>} */
    this.imageCache = new Map();

    this._dragging = false;
    this._lastX = 0;
    this._lastY = 0;

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
    this.offsetX = 0;
    this.offsetY = 0;
    this.scale = 1;
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

    for (const tile of node.tiles) {
      const coords = parseCoords(tile.id);
      if (!coords) continue;
      const { sx, sy, size } = tileRect(coords.x, coords.y, this.tileSize, this.offsetX, this.offsetY, this.scale);
      if (sx + size < 0 || sy + size < 0 || sx > canvas.width || sy > canvas.height) continue;

      if (!tile.revealed) {
        ctx.fillStyle = '#1a1a1a';
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
  }

  /** @param {PointerEvent} event */
  _onPointerDown(event) {
    this._dragging = true;
    this._lastX = event.clientX;
    this._lastY = event.clientY;
  }

  /** @param {PointerEvent} event */
  _onPointerMove(event) {
    if (!this._dragging) return;
    this.offsetX += event.clientX - this._lastX;
    this.offsetY += event.clientY - this._lastY;
    this._lastX = event.clientX;
    this._lastY = event.clientY;
    this.render();
  }

  _onPointerUp() {
    this._dragging = false;
  }

  /** @param {WheelEvent} event */
  _onWheel(event) {
    event.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;

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
