import { getTile } from './TileGrid.js';
import { exitBandGeometry, hitExitBand } from './MapExits.js';
import {
  screenToTile,
  clampZoom,
  clientToBuffer,
  bufferScale,
  inBounds,
  tileIdAt,
} from './MapGeometry.js';

/** @typedef {import('./MapCanvas.js').MapCanvas} MapCanvas */

/**
 * This class manages pointer, touch, and wheel interaction for MapCanvas.
 * A left click or tap acts. A right-drag, or a one-finger touch drag, pans the view.
 * The wheel and pinch gestures zoom the view at the pointer position.
 * The class also handles authoring strokes, hover tracking, and the context click.
 * MapCanvas does not do this work directly, so the canvas class stays the owner
 * of view state and drawing. This controller reads and changes the host's public
 * view fields (offsetX, offsetY, scale, _userView) and runs the host's callbacks.
 */
export class MapCanvasPointer {
  /** @param {MapCanvas} host */
  constructor(host) {
    this.host = host;

    /** @type {string | null} last hovered cell id. Hover fires once per cell, not per pixel. */
    this._hoverCellId = null;
    /** Right-drag pan is active in both modes. */
    this._panning = false;
    /** In Play mode, the left button is down and may become a click. */
    this._pendingClick = false;
    this._lastX = 0;
    this._lastY = 0;
    this._dragDistance = 0;
    this._stroking = false;
    /** @type {string | null} last cell a stroke touched. A stroke applies only once per cell. */
    this._lastStrokeCellId = null;
    /** @type {Map<number, { x: number, y: number }>} active touch points, used for pan and pinch */
    this._touches = new Map();
    /** @type {{ cx: number, cy: number, dist: number } | null} previous two-finger frame */
    this._pinch = null;

    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._onWheel = this._onWheel.bind(this);
    this._onContextMenu = this._onContextMenu.bind(this);
  }

  attach() {
    const { canvas } = this.host;
    canvas.addEventListener('pointerdown', this._onPointerDown);
    canvas.addEventListener('pointermove', this._onPointerMove);
    canvas.addEventListener('pointerup', this._onPointerUp);
    canvas.addEventListener('pointerleave', this._onPointerUp);
    canvas.addEventListener('pointercancel', this._onPointerUp);
    canvas.addEventListener('wheel', this._onWheel, { passive: false });
    canvas.addEventListener('contextmenu', this._onContextMenu);
  }

  detach() {
    const { canvas } = this.host;
    canvas.removeEventListener('pointerdown', this._onPointerDown);
    canvas.removeEventListener('pointermove', this._onPointerMove);
    canvas.removeEventListener('pointerup', this._onPointerUp);
    canvas.removeEventListener('pointerleave', this._onPointerUp);
    canvas.removeEventListener('pointercancel', this._onPointerUp);
    canvas.removeEventListener('wheel', this._onWheel);
    canvas.removeEventListener('contextmenu', this._onContextMenu);
  }

  /** Cancel any gesture in progress. The app calls this when the mode switches
   * to or from authoring. */
  cancel() {
    this._stroking = false;
    this._panning = false;
    this._pendingClick = false;
    this._lastStrokeCellId = null;
  }

  /** The browser's own menu must never open: right-drag pans in both modes,
   * and a right press that did not drag opens the cell menu from pointerup
   * instead. A contextmenu event that no right button raised comes from the
   * keyboard (Shift+F10 or the Menu key in a browser that turns those into
   * this event), so it opens the cell menu at the keyboard cursor.
   * @param {MouseEvent} event */
  _onContextMenu(event) {
    event.preventDefault();
    if (event.button === 2 || this._panning) return;
    this.host._keyboard?.openCursorContextMenu();
  }

  /** @param {PointerEvent} event */
  _onPointerDown(event) {
    const host = this.host;
    // A pointer touch differs in intent from the arrow key that armed an
    // edge exit. The arming lapses instead of letting a later arrow confirm it.
    host.disarmExit();
    if (event.pointerType === 'touch') {
      this._touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      host.canvas.setPointerCapture?.(event.pointerId);
      if (this._touches.size >= 2) {
        // A second finger turns any gesture in progress into a pan or pinch.
        // Cancel the stroke or tap so that lifting a finger does not fire a stray action.
        this._stroking = false;
        this._lastStrokeCellId = null;
        this._pendingClick = false;
        this._panning = false;
        this._pinch = null; // The first two-finger move sets this value.
        return;
      }
      if (host.authoring) {
        // One finger authors, the same as the mouse left button.
        this._stroking = true;
        this._lastStrokeCellId = null;
        this._strokeCell(event, true);
        return;
      }
      // In Play mode, a tap acts and a drag pans. Touch has no second button,
      // so one finger must do both. _onPointerMove changes a tap into a pan.
      this._pendingClick = true;
      this._dragDistance = 0;
      this._lastX = event.clientX;
      this._lastY = event.clientY;
      return;
    }
    if (host.authoring && event.button === 0) {
      // The left button authors. Start a stroke and apply it to the pressed cell.
      // Capture the pointer so that a stroke that moves off the canvas during a
      // drag still applies and still receives its pointerup event.
      this._stroking = true;
      this._lastStrokeCellId = null;
      host.canvas.setPointerCapture?.(event.pointerId);
      this._strokeCell(event, true);
      return;
    }
    // The right button pans in both modes. Play mode and Build mode share
    // one navigation gesture. The left button is free to click or to author.
    if (event.button === 2) {
      this._panning = true;
      this._dragDistance = 0;
      this._lastX = event.clientX;
      this._lastY = event.clientY;
      return;
    }
    // In Play mode, the left button is a click candidate. It navigates or
    // moves on release if it does not become a drag. Left-drag does not pan,
    // the same as Build mode.
    if (!host.authoring && event.button === 0) {
      this._pendingClick = true;
      this._dragDistance = 0;
      this._lastX = event.clientX;
      this._lastY = event.clientY;
    }
  }

  /**
   * Get the grid cell under a pointer event. Return null when the event is
   * outside the node.
   * @param {PointerEvent} event
   * @returns {{ x: number, y: number } | null}
   */
  _eventCell(event) {
    const host = this.host;
    if (!host.node) return null;
    const rect = host.canvas.getBoundingClientRect();
    const buffer = clientToBuffer(
      event.clientX,
      event.clientY,
      rect,
      host.canvas.width,
      host.canvas.height,
    );
    const coords = screenToTile(
      buffer.x,
      buffer.y,
      host.tileSize,
      host.offsetX,
      host.offsetY,
      host.scale,
    );
    return inBounds(host.node, coords.x, coords.y) ? coords : null;
  }

  /**
   * Get the edge exit whose arrow a pointer event falls on, or null.
   * Bands use the same MapExits geometry that the renderer draws.
   * The rect tested here is the same pill shape the GM sees.
   * @param {PointerEvent} event
   * @returns {import('../types/map.js').MapExit | null}
   */
  _eventExit(event) {
    const host = this.host;
    if (!host.node || !host.exits.length || !host.onExitClick) return null;
    const rect = host.canvas.getBoundingClientRect();
    const buffer = clientToBuffer(
      event.clientX,
      event.clientY,
      rect,
      host.canvas.width,
      host.canvas.height,
    );
    const view = {
      offsetX: host.offsetX,
      offsetY: host.offsetY,
      scale: host.scale,
      canvasWidth: host.canvas.width,
      canvasHeight: host.canvas.height,
      partyTileId: host.partyTileId,
    };
    for (const exit of host.exits) {
      if (exit.kind !== 'edge') continue;
      const geom = exitBandGeometry(host.node, view, host.tileSize, exit);
      if (hitExitBand(exit, geom, buffer.x, buffer.y)) return exit;
    }
    return null;
  }

  /**
   * Run onStrokeCell for the cell under the pointer, once for each distinct cell.
   * Skip out-of-bounds cells so a stroke cannot author past the map edge.
   * @param {PointerEvent} event
   * @param {boolean} first
   */
  _strokeCell(event, first) {
    const host = this.host;
    const coords = this._eventCell(event);
    if (!coords || !host.node) return;
    const cellId = tileIdAt(coords.x, coords.y);
    if (cellId === this._lastStrokeCellId) return;
    this._lastStrokeCellId = cellId;
    const tile = getTile(host.node, cellId) ?? null;
    host.onStrokeCell?.(coords.x, coords.y, tile, first);
  }

  /** @param {PointerEvent} event */
  _onPointerMove(event) {
    const host = this.host;
    if (event.pointerType === 'touch' && this._touches.has(event.pointerId)) {
      this._touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (this._touches.size >= 2) {
        this._updatePinch();
        return;
      }
    }
    if (this._stroking) {
      this._strokeCell(event, false);
      return;
    }
    if (this._pendingClick) {
      // Track movement so that a left-drag does not count as a click. No pan
      // happens, except on touch, where a moved finger changes the tap into a
      // pan. Touch has no second button to use only for panning.
      this._dragDistance +=
        Math.abs(event.clientX - this._lastX) + Math.abs(event.clientY - this._lastY);
      if (event.pointerType === 'touch' && this._dragDistance >= 8) {
        this._pendingClick = false;
        this._panning = true;
      }
      this._lastX = event.clientX;
      this._lastY = event.clientY;
      return;
    }
    if (!this._panning) {
      // A return arrow is a control drawn on the canvas. The cursor must show
      // this under the pointer. The grid itself keeps the default cursor.
      host.canvas.style.cursor = this._eventExit(event) ? 'pointer' : '';
      this._trackHover(event);
      return;
    }
    // While panning, any tooltip anchored to the old position is stale.
    this._clearHover();
    // Drag deltas use client (CSS) pixels, but pan offsets use buffer pixels.
    // Scale the delta by the buffer-to-CSS ratio.
    const rect = host.canvas.getBoundingClientRect();
    const { scaleX, scaleY } = bufferScale(rect, host.canvas.width, host.canvas.height);
    const dx = (event.clientX - this._lastX) * scaleX;
    const dy = (event.clientY - this._lastY) * scaleY;
    host._userView = true;
    host.offsetX += dx;
    host.offsetY += dy;
    this._dragDistance += Math.abs(dx) + Math.abs(dy);
    this._lastX = event.clientX;
    this._lastY = event.clientY;
    host.render();
  }

  /**
   * Run onCellHover when the pointer moves into a different grid cell,
   * or leaves the grid. Pass the tile there, if one exists.
   * @param {PointerEvent} event
   */
  _trackHover(event) {
    const host = this.host;
    if (!host.onCellHover || !host.node) return;
    // This uses the same cell resolution as a click. The tooltip always
    // describes the same tile that a click acts on.
    const coords = this._eventCell(event);
    const cellId = coords ? tileIdAt(coords.x, coords.y) : null;
    if (cellId === this._hoverCellId) return;
    this._hoverCellId = cellId;
    const tile = cellId ? (getTile(host.node, cellId) ?? null) : null;
    host.onCellHover(tile, event.clientX, event.clientY);
  }

  /** Reset hover state and tell the handler that the pointer left the grid.
   * Also clear the exit arrow pointer cursor. Otherwise the cursor stays set
   * when the pointer leaves the canvas over an arrow. */
  _clearHover() {
    this.host.canvas.style.cursor = '';
    if (this._hoverCellId === null) return;
    this._hoverCellId = null;
    this.host.onCellHover?.(null, 0, 0);
  }

  /**
   * Two-finger pan and pinch zoom. The centroid delta pans the view.
   * The finger-distance ratio zooms the view, anchored at the centroid.
   * This matches the anchored zoom that the wheel gesture uses.
   */
  _updatePinch() {
    const host = this.host;
    const [a, b] = [...this._touches.values()];
    const cx = (a.x + b.x) / 2;
    const cy = (a.y + b.y) / 2;
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    if (!this._pinch) {
      this._pinch = { cx, cy, dist };
      return;
    }
    this._clearHover();
    host._userView = true;
    const rect = host.canvas.getBoundingClientRect();
    const { scaleX, scaleY } = bufferScale(rect, host.canvas.width, host.canvas.height);
    host.offsetX += (cx - this._pinch.cx) * scaleX;
    host.offsetY += (cy - this._pinch.cy) * scaleY;
    if (this._pinch.dist > 0 && dist > 0) {
      const buffer = clientToBuffer(cx, cy, rect, host.canvas.width, host.canvas.height);
      // Anchor the exact world point under the centroid, the same as the wheel.
      const worldX = (buffer.x - host.offsetX) / host.scale;
      const worldY = (buffer.y - host.offsetY) / host.scale;
      host.scale = clampZoom(host.scale * (dist / this._pinch.dist), host.minZoom, host.maxZoom);
      host.offsetX = buffer.x - worldX * host.scale;
      host.offsetY = buffer.y - worldY * host.scale;
    }
    this._pinch = { cx, cy, dist };
    host.render();
  }

  /** @param {PointerEvent} event */
  _onPointerUp(event) {
    const host = this.host;
    if (event.pointerType === 'touch') {
      this._touches.delete(event.pointerId);
      if (this._touches.size < 2) this._pinch = null;
      if (event.type === 'pointercancel') {
        this._stroking = false;
        this._lastStrokeCellId = null;
        this._pendingClick = false;
        this._panning = false;
        return;
      }
      // A tap that acts must also show the tile tooltip. Touch has no hover,
      // so report the tapped cell before the click handler runs.
      if (this._pendingClick && this._dragDistance < 4) this._trackHover(event);
    }
    if (event.type === 'pointerleave') this._clearHover();
    if (this._stroking) {
      if (event.type === 'pointerleave') return; // The pointer is captured. The stroke ends only on pointerup.
      this._stroking = false;
      this._lastStrokeCellId = null;
      host.onStrokeEnd?.();
      return;
    }
    if (this._panning) {
      this._panning = false;
      // A right press released without a drag is a context click on the cell
      // under it. This code detects it on pointerup, not in the contextmenu
      // handler. macOS fires contextmenu on press, before a drag can disqualify
      // it. The pan gesture must never open the dialog.
      if (this._dragDistance < 4 && host.onCellContextMenu && host.node) {
        const coords = this._eventCell(event);
        if (coords) {
          const tile = getTile(host.node, tileIdAt(coords.x, coords.y)) ?? null;
          host.onCellContextMenu(coords.x, coords.y, tile, event.clientX, event.clientY);
        }
      }
      return; // A pan (right-drag) never acts as a click.
    }
    const wasClick = this._pendingClick && this._dragDistance < 4;
    this._pendingClick = false;
    if (!wasClick || host.authoring || !host.node) return;

    // Exits are tested before cells. A band clamped onto the map, when the
    // border has panned out of view, sits over tiles. The click must land on
    // the arrow the GM sees, not on the terrain behind it.
    const exit = this._eventExit(event);
    if (exit) {
      host.onExitClick?.(exit);
      return;
    }
    if (!host.onCellClick) return;

    // Run for any in-bounds cell, whether or not a tile sits there now.
    // The handler gets the tile if one exists, or null otherwise.
    const coords = this._eventCell(event);
    if (!coords) return;
    const tile = getTile(host.node, tileIdAt(coords.x, coords.y)) ?? null;
    host.onCellClick(coords.x, coords.y, tile);
  }

  /** @param {WheelEvent} event */
  _onWheel(event) {
    const host = this.host;
    event.preventDefault();
    const rect = host.canvas.getBoundingClientRect();
    const buffer = clientToBuffer(
      event.clientX,
      event.clientY,
      rect,
      host.canvas.width,
      host.canvas.height,
    );
    const pointerX = buffer.x;
    const pointerY = buffer.y;

    // Anchor the exact world point under the pointer, not the nearest tile
    // corner. This makes repeated wheel ticks zoom smoothly, without a snap.
    const worldX = (pointerX - host.offsetX) / host.scale;
    const worldY = (pointerY - host.offsetY) / host.scale;
    const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
    host._userView = true;
    host.scale = clampZoom(host.scale * factor, host.minZoom, host.maxZoom);

    host.offsetX = pointerX - worldX * host.scale;
    host.offsetY = pointerY - worldY * host.scale;

    host.render();
  }
}
