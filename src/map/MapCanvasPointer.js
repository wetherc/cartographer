import { getTile } from './TileGrid.js';
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
 * Pointer, touch, and wheel interaction for MapCanvas: left-click/tap acts,
 * right-drag (or one-finger touch drag) pans, wheel and pinch zoom anchored
 * under the pointer, authoring strokes, hover tracking, and the context click.
 * Split out of MapCanvas so the canvas class stays the owner of view state and
 * rendering; this controller reads and mutates the host's public view fields
 * (offsetX/offsetY/scale/_userView) and fires the host's callbacks.
 */
export class MapCanvasPointer {
  /** @param {MapCanvas} host */
  constructor(host) {
    this.host = host;

    /** @type {string | null} last hovered cell id, so hover fires per cell, not per pixel */
    this._hoverCellId = null;
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
    /** @type {Map<number, { x: number, y: number }>} live touch points, for pan/pinch */
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

  /** Abandon any in-flight gesture, used when the mode (authoring) flips. */
  cancel() {
    this._stroking = false;
    this._panning = false;
    this._pendingClick = false;
    this._lastStrokeCellId = null;
  }

  /** Right-drag pans in both modes now, so its context menu must never pop.
   * @param {MouseEvent} event */
  _onContextMenu(event) {
    event.preventDefault();
  }

  /** @param {PointerEvent} event */
  _onPointerDown(event) {
    const host = this.host;
    if (event.pointerType === 'touch') {
      this._touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      host.canvas.setPointerCapture?.(event.pointerId);
      if (this._touches.size >= 2) {
        // A second finger turns any in-flight gesture into a pan/pinch: cancel
        // the stroke/tap so lifting a finger doesn't fire a stray action.
        this._stroking = false;
        this._lastStrokeCellId = null;
        this._pendingClick = false;
        this._panning = false;
        this._pinch = null; // seeded by the first two-finger move
        return;
      }
      if (host.authoring) {
        // One finger authors, like the mouse's left button.
        this._stroking = true;
        this._lastStrokeCellId = null;
        this._strokeCell(event, true);
        return;
      }
      // Play mode: a tap acts, a drag pans (there's no second button on touch,
      // so the single finger has to do both; _onPointerMove promotes it).
      this._pendingClick = true;
      this._dragDistance = 0;
      this._lastX = event.clientX;
      this._lastY = event.clientY;
      return;
    }
    if (host.authoring && event.button === 0) {
      // Left button authors: begin a stroke and apply it to the pressed cell.
      // Capture the pointer so a stroke that wanders off the canvas mid-drag
      // keeps applying and still gets its pointerup.
      this._stroking = true;
      this._lastStrokeCellId = null;
      host.canvas.setPointerCapture?.(event.pointerId);
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
    if (!host.authoring && event.button === 0) {
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
   * Fire onStrokeCell for the cell under the pointer, once per distinct cell,
   * skipping out-of-bounds cells so a stroke can't author past the map edge.
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
      // Track movement so a left-drag doesn't count as a click; no pan —
      // except on touch, where a moved finger promotes the tap into a pan
      // (touch has no second button to dedicate to panning).
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
      this._trackHover(event);
      return;
    }
    // Panning: any tooltip anchored to the old position is stale.
    this._clearHover();
    // Drag deltas are measured in client (CSS) px but pan offsets live in
    // buffer px, so scale the delta by the buffer/CSS ratio.
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
   * Fire onCellHover when the pointer crosses into a different grid cell
   * (or leaves the grid), passing the tile there if one exists.
   * @param {PointerEvent} event
   */
  _trackHover(event) {
    const host = this.host;
    if (!host.onCellHover || !host.node) return;
    // Same cell resolution as a click, so the tooltip can never describe a
    // different tile than the one a click would act on.
    const coords = this._eventCell(event);
    const cellId = coords ? tileIdAt(coords.x, coords.y) : null;
    if (cellId === this._hoverCellId) return;
    this._hoverCellId = cellId;
    const tile = cellId ? (getTile(host.node, cellId) ?? null) : null;
    host.onCellHover(tile, event.clientX, event.clientY);
  }

  /** Reset hover state and tell the handler the pointer is off the grid. */
  _clearHover() {
    if (this._hoverCellId === null) return;
    this._hoverCellId = null;
    this.host.onCellHover?.(null, 0, 0);
  }

  /**
   * Two-finger pan + pinch-zoom: the centroid delta pans, the finger-distance
   * ratio zooms anchored at the centroid, matching the wheel's anchored zoom.
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
      // Anchor the exact world point under the centroid, same as the wheel.
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
      // A tap that acts should also surface the tile tooltip, since touch has
      // no hover: report the tapped cell before the click handler runs.
      if (this._pendingClick && this._dragDistance < 4) this._trackHover(event);
    }
    if (event.type === 'pointerleave') this._clearHover();
    if (this._stroking) {
      if (event.type === 'pointerleave') return; // captured pointer: stroke ends on pointerup
      this._stroking = false;
      this._lastStrokeCellId = null;
      host.onStrokeEnd?.();
      return;
    }
    if (this._panning) {
      this._panning = false;
      // A right press released without dragging is a context click on the cell
      // under it. Detected here on pointerup rather than in the contextmenu
      // handler because macOS fires contextmenu on press, before a drag could
      // disqualify it — and the pan gesture must never pop the dialog.
      if (this._dragDistance < 4 && host.onCellContextMenu && host.node) {
        const coords = this._eventCell(event);
        if (coords) {
          const tile = getTile(host.node, tileIdAt(coords.x, coords.y)) ?? null;
          host.onCellContextMenu(coords.x, coords.y, tile, event.clientX, event.clientY);
        }
      }
      return; // a pan (right-drag) never acts as a click
    }
    const wasClick = this._pendingClick && this._dragDistance < 4;
    this._pendingClick = false;
    if (!wasClick || host.authoring || !host.onCellClick || !host.node) return;

    // Fire for any in-bounds cell, whether or not a tile currently sits there.
    // The handler gets the tile if one exists, or null.
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

    // Anchor the exact world point under the pointer (not the nearest tile
    // corner) so repeated wheel ticks zoom smoothly instead of snapping.
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
