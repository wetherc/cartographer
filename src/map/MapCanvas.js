import { findRegionGroups } from './RegionGroups.js';
import { isCursorKey, nextCursor } from './MapCursor.js';

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
 * Compute the zoom scale and pan offsets that frame an extent of
 * `extentW x extentH` (in world px at scale 1) centered inside a
 * `bufferW x bufferH` canvas with some breathing room, so a node loads
 * filling the view instead of adrift in backdrop at an arbitrary zoom.
 * @param {number} extentW
 * @param {number} extentH
 * @param {number} bufferW
 * @param {number} bufferH
 * @param {{ padding?: number, minScale?: number, maxScale?: number }} [options]
 * @returns {{ scale: number, offsetX: number, offsetY: number }}
 */
export function fitToExtent(extentW, extentH, bufferW, bufferH, options = {}) {
  const padding = options.padding ?? 24;
  if (extentW <= 0 || extentH <= 0 || bufferW <= 0 || bufferH <= 0) {
    return { scale: 1, offsetX: 0, offsetY: 0 };
  }
  const availW = Math.max(1, bufferW - padding * 2);
  const availH = Math.max(1, bufferH - padding * 2);
  const scale = clampZoom(
    Math.min(availW / extentW, availH / extentH),
    options.minScale ?? 0.25,
    options.maxScale ?? 4,
  );
  return {
    scale,
    offsetX: (bufferW - extentW * scale) / 2,
    offsetY: (bufferH - extentH * scale) / 2,
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
   * @param {{ tileSize?: number, minZoom?: number, maxZoom?: number, onCellClick?: (x: number, y: number, tile: Tile | null) => void, onStrokeCell?: (x: number, y: number, tile: Tile | null, first: boolean) => void, onStrokeEnd?: () => void, getNodeName?: (nodeId: string) => string | undefined, onViewChange?: () => void, onCellHover?: (tile: Tile | null, clientX: number, clientY: number) => void }} [options]
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
    this.onStrokeCell = options.onStrokeCell;
    this.onStrokeEnd = options.onStrokeEnd;
    this.getNodeName = options.getNodeName;
    this.onViewChange = options.onViewChange;
    this.onCellHover = options.onCellHover;
    /** @type {string | null} last hovered cell id, so hover fires per cell, not per pixel */
    this._hoverCellId = null;

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
    /** When true (Build mode), the left button strokes cells through
     * onStrokeCell/onStrokeEnd and panning moves to the right button, so
     * authoring gestures and navigation don't share one button. */
    this.authoring = false;
    /** @type {import('./TilePaint.js').CellRect | null} marquee highlight for the region tool */
    this.marquee = null;
    /** @type {string | null} keyboard cursor cell id, drawn only while the canvas has focus */
    this.cursorCellId = null;
    /** @type {boolean} whether the canvas is focused, so the cursor outline shows */
    this._focused = false;
    this.offsetX = 0;
    this.offsetY = 0;
    this.scale = 1;

    /** @type {Map<string, HTMLImageElement>} */
    this.imageCache = new Map();

    this._dragging = false;
    this._lastX = 0;
    this._lastY = 0;
    this._dragDistance = 0;
    this._stroking = false;
    /** @type {string | null} last cell a stroke touched, so a stroke applies once per cell */
    this._lastStrokeCellId = null;

    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._onWheel = this._onWheel.bind(this);
    this._onContextMenu = this._onContextMenu.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onFocus = this._onFocus.bind(this);
    this._onBlur = this._onBlur.bind(this);

    // The map is the app's primary content and was previously mouse/wheel-only;
    // make it a focusable widget so it's keyboard-operable and screen-reader
    // announced (pan/zoom/cursor handled in _onKeyDown).
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'application');
    canvas.setAttribute('aria-label', 'Campaign map. Arrow keys move the cursor, Enter acts, plus and minus zoom.');

    canvas.addEventListener('pointerdown', this._onPointerDown);
    canvas.addEventListener('pointermove', this._onPointerMove);
    canvas.addEventListener('pointerup', this._onPointerUp);
    canvas.addEventListener('pointerleave', this._onPointerUp);
    canvas.addEventListener('wheel', this._onWheel, { passive: false });
    canvas.addEventListener('contextmenu', this._onContextMenu);
    canvas.addEventListener('keydown', this._onKeyDown);
    canvas.addEventListener('focus', this._onFocus);
    canvas.addEventListener('blur', this._onBlur);
  }

  /**
   * Load a new MapNode, framing its full extent in the view.
   * @param {MapNode} node
   */
  setNode(node) {
    this.node = node;
    this.regionGroups = findRegionGroups(node);
    this.partyTileId = null;
    this.selectedTileId = null;
    this.cursorCellId = null;
    this.fit();
  }

  /** Re-frame the current node's full extent in the view (zoom-to-extents). */
  fit() {
    const { node, canvas } = this;
    if (!node) return;
    const fitted = fitToExtent(
      node.width * this.tileSize,
      node.height * this.tileSize,
      canvas.width,
      canvas.height,
      { minScale: this.minZoom, maxScale: this.maxZoom },
    );
    this.scale = fitted.scale;
    this.offsetX = fitted.offsetX;
    this.offsetY = fitted.offsetY;
    this.render();
  }

  /**
   * Zoom by a factor anchored on the canvas centre (the wheel handler anchors
   * on the pointer instead), for the on-canvas +/- controls.
   * @param {number} factor
   */
  zoomBy(factor) {
    const cx = this.canvas.width / 2;
    const cy = this.canvas.height / 2;
    const worldX = (cx - this.offsetX) / this.scale;
    const worldY = (cy - this.offsetY) / this.scale;
    this.scale = clampZoom(this.scale * factor, this.minZoom, this.maxZoom);
    this.offsetX = cx - worldX * this.scale;
    this.offsetY = cy - worldY * this.scale;
    this.render();
  }

  /**
   * Resize the canvas buffer (e.g. when the layout column changes width) and
   * re-frame the node, so the map always fills the space it's given.
   * @param {number} width
   * @param {number} height
   */
  resize(width, height) {
    if (this.canvas.width === width && this.canvas.height === height) return;
    this.canvas.width = width;
    this.canvas.height = height;
    this.fit();
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
   * Toggle authoring interaction (Build mode): left-drag strokes cells,
   * right-drag pans, the context menu is suppressed. Off (Play mode), the
   * left button pans and short drags fire onCellClick as before.
   * @param {boolean} value
   */
  setAuthoring(value) {
    this.authoring = value;
    this._stroking = false;
    this._dragging = false;
    this.setMarquee(null);
  }

  /**
   * Highlight (or clear, with null) a rectangular block of cells — the live
   * preview for the region tool's drag gesture.
   * @param {import('./TilePaint.js').CellRect | null} rect
   */
  setMarquee(rect) {
    this.marquee = rect;
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
    // Pan/zoom/resize all funnel through here, so this is the one place the
    // zoom readout (and any other view-dependent chrome) needs a poke from.
    this.onViewChange?.();
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

      // A drawn (revealed or Build-mode) tile carrying a POI type gets a
      // prominent outline so a discovered point of interest stands out from
      // ordinary terrain.
      if (tile.metadata.poiType) this._renderPoiOutline(sx, sy, size);
    }

    this._renderRegionGroups();
    this._renderMarquee();
    this._renderSelection();
    this._renderPartyMarker();
    this._renderCursor();
    this._renderMapBoundsBorder();
  }

  /**
   * Outline a discovered point-of-interest tile with a glowing gold border, so
   * it reads as special against surrounding terrain. Drawn per tile inside the
   * render loop rather than as an overlay pass, so it sits directly on the tile.
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
   * the Build selection (solid gold) and party marker (dot). */
  _renderCursor() {
    if (!this._focused || !this.cursorCellId) return;
    const coords = parseCoords(this.cursorCellId);
    if (!coords) return;
    const { ctx } = this;
    const { sx, sy, size } = tileRect(coords.x, coords.y, this.tileSize, this.offsetX, this.offsetY, this.scale);
    ctx.save();
    ctx.strokeStyle = '#5ec8ff';
    ctx.lineWidth = 3;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(sx + 1.5, sy + 1.5, size - 3, size - 3);
    ctx.restore();
  }

  /** Dashed outline + tint over the region tool's in-progress drag block. */
  _renderMarquee() {
    if (!this.marquee) return;
    const { ctx } = this;
    const topLeft = tileRect(this.marquee.minX, this.marquee.minY, this.tileSize, this.offsetX, this.offsetY, this.scale);
    const bottomRight = tileRect(this.marquee.maxX, this.marquee.maxY, this.tileSize, this.offsetX, this.offsetY, this.scale);
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

  /** Right-drag pans in authoring mode, so its context menu must not pop.
   * @param {MouseEvent} event */
  _onContextMenu(event) {
    if (this.authoring) event.preventDefault();
  }

  _onFocus() {
    this._focused = true;
    this.render();
  }

  _onBlur() {
    this._focused = false;
    this.render();
  }

  /**
   * Keyboard equivalent of the pointer interactions, so the map is operable
   * without a mouse: arrows move a cursor cell, Enter/Space acts on it (the same
   * paths a click takes), and +/- zoom. Panning is via arrows moving the cursor,
   * which scrolls the view to keep the cursor in frame.
   * @param {KeyboardEvent} event
   */
  _onKeyDown(event) {
    if (!this.node) return;
    if (isCursorKey(event.key)) {
      event.preventDefault();
      const current = this.cursorCellId ? parseCoords(this.cursorCellId) : null;
      const next = nextCursor(current, event.key, this.node.width, this.node.height);
      this.cursorCellId = `${next.x},${next.y}`;
      this._ensureCellVisible(next.x, next.y);
      this.render();
      this._announceCursor();
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this._activateCursor();
      return;
    }
    if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      this.zoomBy(1.25);
    } else if (event.key === '-' || event.key === '_') {
      event.preventDefault();
      this.zoomBy(1 / 1.25);
    }
  }

  /** Act on the cursor cell exactly as a click would: author in Build mode
   * (a one-cell stroke), navigate/move the party in Play mode. */
  _activateCursor() {
    if (!this.cursorCellId || !this.node) return;
    const coords = parseCoords(this.cursorCellId);
    if (!coords) return;
    const tile = this.node.tiles.find((t) => t.id === this.cursorCellId) ?? null;
    if (this.authoring) {
      this.onStrokeCell?.(coords.x, coords.y, tile, true);
      this.onStrokeEnd?.();
    } else {
      this.onCellClick?.(coords.x, coords.y, tile);
    }
  }

  /** Fire onCellHover for the cursor cell so keyboard users get the same
   * tooltip a mouse hover shows, positioned at the cell's screen centre. */
  _announceCursor() {
    if (!this.onCellHover || !this.cursorCellId || !this.node) return;
    const coords = parseCoords(this.cursorCellId);
    if (!coords) return;
    const tile = this.node.tiles.find((t) => t.id === this.cursorCellId) ?? null;
    const rect = this.canvas.getBoundingClientRect();
    const { sx, sy, size } = tileRect(coords.x, coords.y, this.tileSize, this.offsetX, this.offsetY, this.scale);
    const scaleX = rect.width === 0 ? 1 : rect.width / this.canvas.width;
    const scaleY = rect.height === 0 ? 1 : rect.height / this.canvas.height;
    this.onCellHover(
      tile,
      rect.left + (sx + size / 2) * scaleX,
      rect.top + (sy + size / 2) * scaleY,
    );
  }

  /** Pan the view so a cell sits inside the visible buffer, used when the
   * keyboard cursor moves toward or past an edge. */
  _ensureCellVisible(x, y) {
    const { sx, sy, size } = tileRect(x, y, this.tileSize, this.offsetX, this.offsetY, this.scale);
    const margin = size;
    if (sx < margin) this.offsetX += margin - sx;
    else if (sx + size > this.canvas.width - margin) this.offsetX -= sx + size - (this.canvas.width - margin);
    if (sy < margin) this.offsetY += margin - sy;
    else if (sy + size > this.canvas.height - margin) this.offsetY -= sy + size - (this.canvas.height - margin);
  }

  /** @param {PointerEvent} event */
  _onPointerDown(event) {
    if (this.authoring && event.button === 0) {
      // Left button authors: begin a stroke and apply it to the pressed cell.
      // Capture the pointer so a stroke that wanders off the canvas mid-drag
      // keeps applying and still gets its pointerup.
      this._stroking = true;
      this._lastStrokeCellId = null;
      this.canvas.setPointerCapture?.(event.pointerId);
      this._strokeCell(event, true);
      return;
    }
    // Panning: the right button while authoring, the left button otherwise.
    if (event.button !== (this.authoring ? 2 : 0)) return;
    this._dragging = true;
    this._dragDistance = 0;
    this._lastX = event.clientX;
    this._lastY = event.clientY;
  }

  /**
   * The grid cell under a pointer event, or null when it's outside the node.
   * @param {PointerEvent} event
   * @returns {{ x: number, y: number } | null}
   */
  _eventCell(event) {
    if (!this.node) return null;
    const rect = this.canvas.getBoundingClientRect();
    const buffer = clientToBuffer(event.clientX, event.clientY, rect, this.canvas.width, this.canvas.height);
    const coords = screenToTile(buffer.x, buffer.y, this.tileSize, this.offsetX, this.offsetY, this.scale);
    const inBounds =
      coords.x >= 0 && coords.y >= 0 && coords.x < this.node.width && coords.y < this.node.height;
    return inBounds ? coords : null;
  }

  /**
   * Fire onStrokeCell for the cell under the pointer, once per distinct cell,
   * skipping out-of-bounds cells so a stroke can't author past the map edge.
   * @param {PointerEvent} event
   * @param {boolean} first
   */
  _strokeCell(event, first) {
    const coords = this._eventCell(event);
    if (!coords || !this.node) return;
    const cellId = `${coords.x},${coords.y}`;
    if (cellId === this._lastStrokeCellId) return;
    this._lastStrokeCellId = cellId;
    const tile = this.node.tiles.find((t) => t.id === cellId) ?? null;
    this.onStrokeCell?.(coords.x, coords.y, tile, first);
  }

  /** @param {PointerEvent} event */
  _onPointerMove(event) {
    if (this._stroking) {
      this._strokeCell(event, false);
      return;
    }
    if (!this._dragging) {
      this._trackHover(event);
      return;
    }
    // Panning: any tooltip anchored to the old position is stale.
    this._clearHover();
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

  /**
   * Fire onCellHover when the pointer crosses into a different grid cell
   * (or leaves the grid), passing the tile there if one exists.
   * @param {PointerEvent} event
   */
  _trackHover(event) {
    if (!this.onCellHover || !this.node) return;
    const rect = this.canvas.getBoundingClientRect();
    const buffer = clientToBuffer(event.clientX, event.clientY, rect, this.canvas.width, this.canvas.height);
    const coords = screenToTile(buffer.x, buffer.y, this.tileSize, this.offsetX, this.offsetY, this.scale);
    const inBounds =
      coords.x >= 0 && coords.y >= 0 && coords.x < this.node.width && coords.y < this.node.height;
    const cellId = inBounds ? `${coords.x},${coords.y}` : null;
    if (cellId === this._hoverCellId) return;
    this._hoverCellId = cellId;
    const tile = cellId ? (this.node.tiles.find((t) => t.id === cellId) ?? null) : null;
    this.onCellHover(tile, event.clientX, event.clientY);
  }

  /** Reset hover state and tell the handler the pointer is off the grid. */
  _clearHover() {
    if (this._hoverCellId === null) return;
    this._hoverCellId = null;
    this.onCellHover?.(null, 0, 0);
  }

  /** @param {PointerEvent} event */
  _onPointerUp(event) {
    if (event.type === 'pointerleave') this._clearHover();
    if (this._stroking) {
      if (event.type === 'pointerleave') return; // captured pointer: stroke ends on pointerup
      this._stroking = false;
      this._lastStrokeCellId = null;
      this.onStrokeEnd?.();
      return;
    }
    const wasClick = this._dragging && this._dragDistance < 4;
    this._dragging = false;
    // A short right-drag (authoring pan) must not read as a click.
    if (!wasClick || this.authoring || !this.onCellClick || !this.node) return;

    // Fire for any in-bounds cell, whether or not a tile currently sits there.
    // The handler gets the tile if one exists, or null.
    const coords = this._eventCell(event);
    if (!coords) return;
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
    this.canvas.removeEventListener('contextmenu', this._onContextMenu);
    this.canvas.removeEventListener('keydown', this._onKeyDown);
    this.canvas.removeEventListener('focus', this._onFocus);
    this.canvas.removeEventListener('blur', this._onBlur);
  }
}
