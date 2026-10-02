import { tileIdAt } from '../map/MapGeometry.js';
import { textButton } from '../ui/buttons.js';
import { el } from '../ui/dom.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/app.js').AppMode} AppMode */
/** @typedef {import('../types/entities.js').EncounterLocation} EncounterLocation */

/**
 * The map callbacks that a tile pick takes over. A Play-mode click arrives
 * as `onCellClick`, and a Build-mode click arrives as a one-cell stroke.
 * @typedef {Pick<import('../map/MapCanvas.js').MapCanvas,
 *   'onCellClick' | 'onStrokeCell' | 'onStrokeEnd' | 'onExitClick' | 'onCellContextMenu'>} PickHost
 */

/**
 * Whether a mode shows the map, so that a "Pick on map" button has a map to
 * pick on. Library mode and the combat screen hide the map, and a pick there
 * would close the dialog and wait for a click that the GM cannot make.
 * @param {AppMode} mode
 * @returns {boolean}
 */
export function canPickOnMap(mode) {
  return mode === 'play' || mode === 'build';
}

/**
 * Make the next map click call `onPick` with the cell, in place of its usual
 * action. A click in Play mode does not move the party, and a click in Build
 * mode does not paint. A Build-mode drag picks its first cell when the drag
 * ends, and paints no tiles. The pick waits for the end of the drag because
 * the caller can open a dialog in `onPick`, and the canvas behind a modal
 * dialog gets no pointerup. A stroke that stops with no end (a pinch, or a
 * pointercancel) leaves no cell behind, because the next stroke's first cell
 * replaces it. Exit arrows and the right-click menu do nothing while the
 * pick waits. The returned function puts the usual callbacks back. It runs
 * by itself before `onPick`, and a caller runs it to cancel.
 * @param {PickHost} host
 * @param {(x: number, y: number) => void} onPick
 * @returns {() => void}
 */
export function armTilePick(host, onPick) {
  const saved = {
    onCellClick: host.onCellClick,
    onStrokeCell: host.onStrokeCell,
    onStrokeEnd: host.onStrokeEnd,
    onExitClick: host.onExitClick,
    onCellContextMenu: host.onCellContextMenu,
  };
  const disarm = () => Object.assign(host, saved);
  /** @type {{ x: number, y: number } | null} */
  let first = null;
  const pick = (/** @type {number} */ x, /** @type {number} */ y) => {
    disarm();
    onPick(x, y);
  };
  const ignore = () => {};
  Object.assign(host, {
    onCellClick: pick,
    onStrokeCell: (
      /** @type {number} */ x,
      /** @type {number} */ y,
      /** @type {unknown} */ _tile,
      /** @type {boolean} */ start,
    ) => {
      if (start || !first) first = { x, y };
    },
    onStrokeEnd: () => {
      const cell = first;
      first = null;
      if (cell) pick(cell.x, cell.y);
    },
    onExitClick: ignore,
    onCellContextMenu: ignore,
  });
  return disarm;
}

/**
 * The cancel of the pick that waits, or null. One pick waits at a time. A
 * second pick cancels the first, so the first pick's callbacks never become
 * the "usual" callbacks that the second pick puts back.
 * @type {(() => void) | null}
 */
let cancelWaiting = null;

/**
 * Wait for the GM to click one tile of the map in view. A hint over the map
 * says what to do, and Escape or its Cancel button cancels. The button
 * gives a touch screen, which has no Escape key, a way out. On a phone the
 * Play screen shows the Map view while the pick waits, and the earlier view
 * comes back after it. The result is the map and tile that the GM clicked,
 * or null on cancel.
 * @param {AppContext} app
 * @param {string} [hint]
 * @returns {Promise<EncounterLocation | null>}
 */
export function pickMapTile(
  app,
  hint = 'Click a tile to place the creature. Press Escape to cancel.',
) {
  cancelWaiting?.();
  const canvas = app.views.mapCanvas;
  const body = document.body;
  // The phone layout shows the map only in the Map view. The attribute has
  // no effect at wider screens, where the map always shows.
  const view = body.dataset.phoneView;
  if (view) body.dataset.phoneView = 'map';
  /** @type {() => void} */
  let disarm = () => {};
  /** @type {(result: EncounterLocation | null) => void} */
  let finish = () => {};
  const cancel = () => {
    disarm();
    finish(null);
  };
  // A status region announces a change of its text, and a region that
  // arrives already filled is often not read. The text goes in a frame later.
  const text = el('p', 'map-pick-hint__text');
  text.setAttribute('role', 'status');
  const note = el('div', 'map-pick-hint u-row u-g2', text, textButton('Cancel', cancel));
  canvas.canvas.parentElement?.appendChild(note);
  requestAnimationFrame(() => {
    text.textContent = hint;
  });
  return new Promise((resolve) => {
    // A pick puts the map callbacks back by itself, after the click or at
    // the end of the drag. Escape and Cancel put them back at once.
    /** @param {EncounterLocation | null} result */
    finish = (result) => {
      cancelWaiting = null;
      document.removeEventListener('keydown', onKey, true);
      note.remove();
      // A tap on the bottom bar during the pick chose a view, which stays.
      if (view && body.dataset.phoneView === 'map') body.dataset.phoneView = view;
      resolve(result);
    };
    /** @param {KeyboardEvent} event */
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      cancel();
    };
    disarm = armTilePick(canvas, (x, y) =>
      finish({ nodeId: app.navigator.getCurrentNode().id, tileId: tileIdAt(x, y) }),
    );
    cancelWaiting = cancel;
    document.addEventListener('keydown', onKey, true);
    canvas.canvas.focus();
  });
}
