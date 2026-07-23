import { findRegionGroups } from './RegionGroups.js';
import { isCursorKey, nextCursor } from './MapCursor.js';
import { MapRenderer } from './MapRenderer.js';
import {
  parseCoords,
  tileRect,
  screenToTile,
  clampZoom,
  clientToBuffer,
  fitToExtent,
} from './MapGeometry.js';

/** @typedef {import('../types/map.js').MapNode} MapNode */
/** @typedef {import('../types/map.js').Tile} Tile */
/** @typedef {import('./TilePalette.js').TilePalette} TilePalette */
/** @typedef {import('./RegionGroups.js').RegionGroup} RegionGroup */

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

    // Drawing lives in MapRenderer; MapCanvas stays the owner of interaction
    // state and hands the renderer a view snapshot each frame. A tile image
    // that finishes loading asks for a redraw so it appears once decoded.
    this.renderer = new MapRenderer(this.ctx, {
      tileSize: this.tileSize,
      getNodeName: this.getNodeName,
      onImageLoad: () => this.render(),
    });

    /** Right-drag pan is active (both modes). */
    this._panning = false;
    /** Play-mode left button is down and may resolve to a click. */
    this._pendingClick = false;
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
    this._panning = false;
    this._pendingClick = false;
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
   * Assemble the current interaction state into a view snapshot and hand it to
   * the renderer. Pan/zoom/resize and every state setter funnel through here,
   * so this is also the one place the zoom readout (and any other view-dependent
   * chrome) needs poking from.
   * @returns {import('./MapRenderer.js').MapView}
   */
  _view() {
    return {
      canvasWidth: this.canvas.width,
      canvasHeight: this.canvas.height,
      node: this.node,
      regionGroups: this.regionGroups,
      offsetX: this.offsetX,
      offsetY: this.offsetY,
      scale: this.scale,
      revealAll: this.revealAll,
      partyTileId: this.partyTileId,
      selectedTileId: this.selectedTileId,
      cursorCellId: this.cursorCellId,
      focused: this._focused,
      marquee: this.marquee,
    };
  }

  render() {
    this.onViewChange?.();
    this.renderer.render(this._view());
  }

  /** Right-drag pans in both modes now, so its context menu must never pop.
   * @param {MouseEvent} event */
  _onContextMenu(event) {
    event.preventDefault();
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
    // Panning is the right button in both modes, so Play and Build share one
    // navigation gesture and the left button is free to act (click) or author.
    if (event.button === 2) {
      this._panning = true;
      this._dragDistance = 0;
      this._lastX = event.clientX;
      this._lastY = event.clientY;
      return;
    }
    // Play-mode left button: a click candidate (navigate/move on release if it
    // didn't turn into a drag). No left-drag pan, matching Build mode.
    if (!this.authoring && event.button === 0) {
      this._pendingClick = true;
      this._dragDistance = 0;
      this._lastX = event.clientX;
      this._lastY = event.clientY;
    }
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
    if (this._pendingClick) {
      // Track movement so a left-drag doesn't count as a click; no pan.
      this._dragDistance += Math.abs(event.clientX - this._lastX) + Math.abs(event.clientY - this._lastY);
      this._lastX = event.clientX;
      this._lastY = event.clientY;
      return;
    }
    if (!this._panning) {
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
    if (this._panning) {
      this._panning = false;
      return; // a pan (right-drag) never acts as a click
    }
    const wasClick = this._pendingClick && this._dragDistance < 4;
    this._pendingClick = false;
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
