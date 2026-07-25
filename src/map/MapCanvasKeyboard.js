import { getTile } from './TileGrid.js';
import { isCursorKey, nextCursor } from './MapCursor.js';
import { parseCoords, tileRect } from './MapGeometry.js';

/** @typedef {import('./MapCanvas.js').MapCanvas} MapCanvas */

/**
 * Keyboard operation for MapCanvas, so the map works without a mouse: arrow
 * keys move a cursor cell (scrolling it into view), Enter/Space acts on it via
 * the same paths a click takes, +/- zoom, and focus toggles the cursor
 * outline. Split out of MapCanvas so the canvas class stays the owner of view
 * state and rendering; this controller reads and mutates the host's cursor and
 * pan fields and fires the host's callbacks.
 */
export class MapCanvasKeyboard {
  /** @param {MapCanvas} host */
  constructor(host) {
    this.host = host;
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onFocus = this._onFocus.bind(this);
    this._onBlur = this._onBlur.bind(this);
  }

  attach() {
    const { canvas } = this.host;
    canvas.addEventListener('keydown', this._onKeyDown);
    canvas.addEventListener('focus', this._onFocus);
    canvas.addEventListener('blur', this._onBlur);
  }

  detach() {
    const { canvas } = this.host;
    canvas.removeEventListener('keydown', this._onKeyDown);
    canvas.removeEventListener('focus', this._onFocus);
    canvas.removeEventListener('blur', this._onBlur);
  }

  _onFocus() {
    this.host._focused = true;
    this.host.render();
  }

  _onBlur() {
    this.host._focused = false;
    this.host.render();
  }

  /**
   * Keyboard equivalent of the pointer interactions: arrows move a cursor
   * cell, Enter/Space acts on it (the same paths a click takes), and +/-
   * zoom. Panning is via arrows moving the cursor, which scrolls the view to
   * keep the cursor in frame.
   * @param {KeyboardEvent} event
   */
  _onKeyDown(event) {
    const host = this.host;
    if (!host.node) return;
    if (isCursorKey(event.key)) {
      event.preventDefault();
      const current = host.cursorCellId ? parseCoords(host.cursorCellId) : null;
      const next = nextCursor(current, event.key, host.node.width, host.node.height);
      host.cursorCellId = `${next.x},${next.y}`;
      this._ensureCellVisible(next.x, next.y);
      host.render();
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
      host.zoomBy(1.25);
    } else if (event.key === '-' || event.key === '_') {
      event.preventDefault();
      host.zoomBy(1 / 1.25);
    }
  }

  /** Act on the cursor cell exactly as a click would: author in Build mode
   * (a one-cell stroke), navigate/move the party in Play mode. */
  _activateCursor() {
    const host = this.host;
    if (!host.cursorCellId || !host.node) return;
    const coords = parseCoords(host.cursorCellId);
    if (!coords) return;
    const tile = getTile(host.node, host.cursorCellId) ?? null;
    if (host.authoring) {
      host.onStrokeCell?.(coords.x, coords.y, tile, true);
      host.onStrokeEnd?.();
    } else {
      host.onCellClick?.(coords.x, coords.y, tile);
    }
  }

  /** Fire onCellHover for the cursor cell so keyboard users get the same
   * tooltip a mouse hover shows, positioned at the cell's screen centre. */
  _announceCursor() {
    const host = this.host;
    if (!host.onCellHover || !host.cursorCellId || !host.node) return;
    const coords = parseCoords(host.cursorCellId);
    if (!coords) return;
    const tile = getTile(host.node, host.cursorCellId) ?? null;
    const rect = host.canvas.getBoundingClientRect();
    const { sx, sy, size } = tileRect(
      coords.x,
      coords.y,
      host.tileSize,
      host.offsetX,
      host.offsetY,
      host.scale,
    );
    const scaleX = rect.width === 0 ? 1 : rect.width / host.canvas.width;
    const scaleY = rect.height === 0 ? 1 : rect.height / host.canvas.height;
    host.onCellHover(
      tile,
      rect.left + (sx + size / 2) * scaleX,
      rect.top + (sy + size / 2) * scaleY,
    );
  }

  /** Pan the view so a cell sits inside the visible buffer, used when the
   * keyboard cursor moves toward or past an edge.
   * @param {number} x @param {number} y */
  _ensureCellVisible(x, y) {
    const host = this.host;
    const { sx, sy, size } = tileRect(x, y, host.tileSize, host.offsetX, host.offsetY, host.scale);
    host._userView = true;
    const margin = size;
    if (sx < margin) host.offsetX += margin - sx;
    else if (sx + size > host.canvas.width - margin)
      host.offsetX -= sx + size - (host.canvas.width - margin);
    if (sy < margin) host.offsetY += margin - sy;
    else if (sy + size > host.canvas.height - margin)
      host.offsetY -= sy + size - (host.canvas.height - margin);
  }
}
