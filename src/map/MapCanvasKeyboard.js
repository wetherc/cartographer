import { getTile } from './TileGrid.js';
import { cellClientCenter, cursorSide, isCursorKey, nextCursor } from './MapCursor.js';
import { exitForSide } from './MapExits.js';
import { parseCoords, tileIdAt, tileRect } from './MapGeometry.js';

/**
 * Whether a key press asks for the context menu, the way a right click does.
 * Shift+F10 is the convention on every desktop, and the dedicated Menu key
 * reports itself as ContextMenu.
 * @param {{ key: string, shiftKey?: boolean }} event
 * @returns {boolean}
 */
export function isContextMenuKey(event) {
  return event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey === true);
}

/** @typedef {import('./MapCanvas.js').MapCanvas} MapCanvas */

/**
 * This class gives keyboard operation for MapCanvas, so the map works
 * without a mouse. Arrow keys move a cursor cell and scroll it into view.
 * Enter or Space acts on the cursor cell through the same paths as a click.
 * Shift+F10 or the Menu key opens the cell's context menu at the cell's
 * screen centre. Plus and minus zoom the view. Focus toggles the cursor outline. This
 * class is separate from MapCanvas so the MapCanvas class stays the owner
 * of view state and drawing. This controller reads and changes the host's
 * cursor and pan fields, and it fires the host's callbacks.
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
   * Keyboard equivalent of the pointer interactions. Arrow keys move a
   * cursor cell. Enter or Space acts on the cursor cell through the same
   * paths as a click. Plus and minus zoom the view. Arrow keys also pan the
   * view: moving the cursor scrolls the view to keep the cursor in frame.
   * @param {KeyboardEvent} event
   */
  _onKeyDown(event) {
    const host = this.host;
    if (!host.node) return;
    if (isCursorKey(event.key)) {
      event.preventDefault();
      const current = host.cursorCellId ? parseCoords(host.cursorCellId) : null;
      const next = nextCursor(current, event.key, host.node.width, host.node.height);
      // If an arrow key points at the border and the cursor is already there,
      // the cursor stays in place. If that border is a way out, this key
      // press arms the exit. A second press of the same arrow key takes the
      // exit. Walking off the edge is the natural meaning of the arrow key,
      // so the user does not need to learn an extra key. A single press
      // cannot move the whole party. Without that limit, holding an arrow key
      // works like a teleport: the cursor reaches the border, and the
      // next key repeat walks out immediately. A repeated key press
      // (from holding the key down) never arms or confirms the exit. So
      // leaving a node always needs two deliberate key presses. The arming
      // is narrated through onExitArmed and drawn as a brighter band, before
      // anything moves.
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
      // Any cursor move away from the border cancels an armed exit.
      host.disarmExit();
      host.cursorCellId = tileIdAt(next.x, next.y);
      this._ensureCellVisible(next.x, next.y);
      host.render();
      this._announceCursor();
      host.onCursorMove?.(host.cursorCellId);
      return;
    }
    // Any other key cancels an armed exit. Only the same arrow key confirms it.
    host.disarmExit();
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this._activateCursor();
      return;
    }
    if (isContextMenuKey(event)) {
      event.preventDefault();
      this.openCursorContextMenu();
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

  /** Act on the cursor cell exactly as a click would. In Build mode, this
   * authors a one-cell stroke. In Play mode, this navigates or moves the party. */
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

  /**
   * The cursor cell with its tile and its screen centre, or null when there
   * is no node, no cursor, or a cursor id outside the grid format.
   * @returns {{ coords: { x: number, y: number }, tile: import('../types/map.js').Tile | null, clientX: number, clientY: number } | null}
   */
  _cursorTarget() {
    const host = this.host;
    if (!host.cursorCellId || !host.node) return null;
    const coords = parseCoords(host.cursorCellId);
    if (!coords) return null;
    const tile = getTile(host.node, host.cursorCellId) ?? null;
    const { clientX, clientY } = cellClientCenter(
      coords,
      host,
      host.canvas.getBoundingClientRect(),
      host.canvas.width,
      host.canvas.height,
    );
    return { coords, tile, clientX, clientY };
  }

  /** Fire onCellHover for the cursor cell. Keyboard users then get the same
   * tooltip as a mouse hover, positioned at the cell's screen centre. */
  _announceCursor() {
    if (!this.host.onCellHover) return;
    const target = this._cursorTarget();
    if (!target) return;
    this.host.onCellHover(target.tile, target.clientX, target.clientY);
  }

  /** Open the cell context menu for the cursor cell, at the cell's screen
   * centre, the way a right click opens it under the pointer. The pointer
   * controller also calls this for a contextmenu event that came from the
   * keyboard rather than from a button. */
  openCursorContextMenu() {
    if (!this.host.onCellContextMenu) return;
    const target = this._cursorTarget();
    if (!target) return;
    this.host.onCellContextMenu(
      target.coords.x,
      target.coords.y,
      target.tile,
      target.clientX,
      target.clientY,
    );
  }

  /** Pan the view so a cell sits inside the visible buffer. This runs when the
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
