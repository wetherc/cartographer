import { test } from 'node:test';
import assert from 'node:assert/strict';

import { armTilePick, canPickOnMap, isTilePickWaiting, pickHint } from '../src/app/mapPick.js';

/** A stand-in for the MapCanvas callbacks, which record each call. */
function host() {
  /** @type {string[]} */
  const calls = [];
  const h = {
    calls,
    onCellClick: (/** @type {number} */ x, /** @type {number} */ y) =>
      calls.push(`click ${x},${y}`),
    onStrokeCell: (/** @type {number} */ x, /** @type {number} */ y) =>
      calls.push(`paint ${x},${y}`),
    onStrokeEnd: () => calls.push('end'),
    onExitClick: () => calls.push('exit'),
    onCellContextMenu: () => calls.push('menu'),
  };
  return h;
}

test('a Play-mode click picks the cell and puts the callbacks back', () => {
  const h = host();
  /** @type {number[][]} */
  const picks = [];
  armTilePick(/** @type {any} */ (h), (x, y) => picks.push([x, y]));
  h.onExitClick();
  h.onCellContextMenu();
  h.onCellClick(3, 4);
  assert.deepEqual(picks, [[3, 4]]);
  assert.deepEqual(h.calls, []);
  h.onCellClick(1, 1);
  assert.deepEqual(h.calls, ['click 1,1']);
});

test('a Build-mode drag picks its first cell at the end and paints nothing', () => {
  const h = host();
  /** @type {number[][]} */
  const picks = [];
  armTilePick(/** @type {any} */ (h), (x, y) => picks.push([x, y]));
  h.onStrokeEnd();
  assert.deepEqual(picks, []);
  h.onStrokeCell(2, 5);
  h.onStrokeCell(3, 5);
  assert.deepEqual(picks, []);
  h.onStrokeEnd();
  assert.deepEqual(picks, [[2, 5]]);
  h.onStrokeCell(0, 0);
  assert.deepEqual(h.calls, ['paint 0,0']);
});

test('disarm cancels the pick', () => {
  const h = host();
  let picked = false;
  const disarm = armTilePick(/** @type {any} */ (h), () => (picked = true));
  disarm();
  h.onCellClick(1, 2);
  assert.equal(picked, false);
  assert.deepEqual(h.calls, ['click 1,2']);
});

test('a stroke with no end leaves no cell behind for the next stroke', () => {
  const h = host();
  /** @type {number[][]} */
  const picks = [];
  armTilePick(/** @type {any} */ (h), (x, y) => picks.push([x, y]));
  // The first finger of a pinch starts a stroke, and the second finger
  // cancels it with no stroke end.
  /** @type {any} */ (h.onStrokeCell)(3, 4, null, true);
  /** @type {any} */ (h.onStrokeCell)(12, 9, null, true);
  /** @type {any} */ (h.onStrokeCell)(13, 9, null, false);
  h.onStrokeEnd();
  assert.deepEqual(picks, [[12, 9]]);
});

test('canPickOnMap is true only in the modes that show the map', () => {
  assert.deepEqual(
    /** @type {const} */ (['play', 'build', 'library', 'combat']).map(canPickOnMap),
    [true, true, false, false],
  );
});

test('the pick hint names the map in view, and no pick waits at load', () => {
  assert.equal(
    pickHint('Corby'),
    'Click a tile of Corby to place the creature. Press Escape to cancel.',
  );
  assert.equal(isTilePickWaiting(), false);
});
