import { getTile } from './TileGrid.js';
import { cursorSide, isCursorKey, nextCursor } from './MapCursor.js';
import { exitForSide } from './MapExits.js';
import { parseCoords, tileIdAt, tileRect } from './MapGeometry.js';

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
    this.host.disarmExit();
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
      // An arrow pressed at the border it points at leaves the cursor where it
      // is; when that border is a way out, arm it, and a second press of the
      // same arrow takes it. Walking off the edge is the gesture the arrow
      // already suggests, so there is no extra key to learn, but a single press
      // moving the whole party would make holding an arrow key a teleport: the
      // cursor sails to the border and the next key repeat would walk out.
      // Repeats never arm or confirm, so leaving is always two deliberate
      // presses, and the arming is narrated (onExitArmed) and drawn (the band
      // brightens) before anything moves.
      if (current && next.x === current.x && next.y === current.y && !host.authoring) {
        const side = cursorSide(event.key);
        const exit = side ? exitForSide(host.exits, side) : null;
        if (exit) {
          if (event.repeat) return;
          if (host.armedExitSide === side) {
            host.disarmExit();
            host.onExitClick?.(exit);
            return;
          }
          host.armedExitSide = side;
          host.onExitArmed?.(exit);
          host.render();
          return;
        }
      }
      // Any cursor move away from the border withdraws an armed exit.
      host.disarmExit();
      host.cursorCellId = tileIdAt(next.x, next.y);
      this._ensureCellVisible(next.x, next.y);
      host.render();
      this._announceCursor();
      return;
    }
    // Any other key withdraws an armed exit; only the same arrow confirms it.
    host.disarmExit();
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
