import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cellBoxes,
  mapAreaEdge,
  regionBorderWidth,
  regionCellBoxes,
  regionLabelMetrics,
  regionNameLayout,
} from '../src/map/RegionOverlayLayout.js';

test('cellBoxes turns tile ids into screen boxes and skips bad ids', () => {
  const view = /** @type {any} */ ({ offsetX: 5, offsetY: 10 });
  assert.deepEqual(cellBoxes(['2,1', 'nope'], view, 20), [{ x: 45, y: 30, w: 20, h: 20 }]);
});

const view = (/** @type {number} */ offset) => ({
  node: { width: 30, height: 30 },
  offsetX: offset,
  offsetY: offset,
  scale: 1,
  canvasWidth: 800,
  canvasHeight: 600,
});

test('mapAreaEdge starts a name past the digit strips pinned to the canvas edge', () => {
  const edge = mapAreaEdge(view(-200), 40);
  // The pinned digits use a 14 px font, centred 12.6 px in from each edge.
  assert.ok(edge.x > 20 && edge.x < 30, `x ${edge.x}`);
  assert.ok(edge.y > 20 && edge.y < 30, `y ${edge.y}`);
});

test('mapAreaEdge ignores digit strips that sit off the map beside it', () => {
  const edge = mapAreaEdge(view(100), 40);
  assert.ok(edge.x < 100 && edge.y < 100, JSON.stringify(edge));
});

test('mapAreaEdge falls back to the canvas edge with no digits', () => {
  assert.deepEqual(mapAreaEdge({ ...view(-200), node: null }, 40), { x: 0, y: 0 });
  assert.deepEqual(mapAreaEdge({ ...view(-200), scale: 0.1 }, 40), { x: 0, y: 0 });
});

/** A region group over the listed cells. */
function group(/** @type {string} */ childNodeId, /** @type {[number, number][]} */ cells) {
  const xs = cells.map(([x]) => x);
  const ys = cells.map(([, y]) => y);
  return {
    childNodeId,
    tileIds: cells.map(([x, y]) => `${x},${y}`),
    cells: cells.map(([x, y]) => ({ x, y })),
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

test('regionCellBoxes covers every cell, or only the revealed ones under fog', () => {
  const g = group('town', [
    [1, 1],
    [2, 1],
  ]);
  const at = { offsetX: 0, offsetY: 0 };
  assert.deepEqual(regionCellBoxes(g, at, 10, null), [
    { x: 10, y: 10, w: 10, h: 10 },
    { x: 20, y: 10, w: 10, h: 10 },
  ]);
  assert.deepEqual(regionCellBoxes(g, at, 10, new Set(['2,1'])), [{ x: 20, y: 10, w: 10, h: 10 }]);
  assert.deepEqual(regionCellBoxes(g, at, 10, new Set()), []);
});

test('regionBorderWidth stays between 2 and 4 CSS px and doubles for the brush target', () => {
  assert.equal(regionBorderWidth(12, 1, false), 2);
  assert.equal(regionBorderWidth(36, 1, false), 3);
  assert.equal(regionBorderWidth(120, 2, false), 8);
  assert.equal(regionBorderWidth(120, 1, true), 8);
});

test('regionLabelMetrics scales the font and padding with the pixel ratio', () => {
  assert.deepEqual(regionLabelMetrics(1), { fontSize: 12, padX: 4, padY: 2, h: 16 });
  assert.deepEqual(regionLabelMetrics(2), { fontSize: 24, padX: 8, padY: 4, h: 32 });
});

/** A view of a 10 x 10 node at 40 px tiles, scrolled so the digit strips sit off the map. */
const named = (/** @type {any[]} */ regionGroups, over = {}) =>
  /** @type {any} */ ({
    node: { width: 10, height: 10 },
    offsetX: 100,
    offsetY: 100,
    scale: 1,
    canvasWidth: 800,
    canvasHeight: 600,
    regionGroups,
    ...over,
  });
const names = { town: 'Corby', fen: 'Mirefen', far: 'Far' };
const nameOf = (/** @type {string} */ id) => names[/** @type {keyof typeof names} */ (id)];
const measure = (/** @type {string} */ name) => name.length * 6;

test('regionNameLayout puts each name at the first cell of its region', () => {
  const labels = regionNameLayout(
    named([group('town', [[1, 1]]), group('fen', [[5, 5]]), group('nameless', [[8, 8]])]),
    null,
    40,
    nameOf,
    [],
    measure,
  );
  assert.deepEqual(labels, [
    { name: 'Corby', box: { x: 140, y: 140, w: 38, h: 16 } },
    { name: 'Mirefen', box: { x: 300, y: 300, w: 50, h: 16 } },
  ]);
});

test('regionNameLayout leaves out unrevealed regions, off-canvas names, and a view with no node', () => {
  const groups = [group('town', [[1, 1]]), group('fen', [[5, 5]]), group('far', [[9, 9]])];
  const fogged = regionNameLayout(named(groups), new Set(['1,1', '9,9']), 40, nameOf, [], measure);
  assert.deepEqual(
    fogged.map((l) => l.name),
    ['Corby', 'Far'],
  );
  const small = named(groups, { canvasWidth: 200, canvasHeight: 200 });
  assert.deepEqual(
    regionNameLayout(small, null, 40, nameOf, [], measure).map((l) => l.name),
    ['Corby'],
  );
  const left = named(groups, { offsetX: -1000, offsetY: -1000 });
  assert.deepEqual(regionNameLayout(left, null, 40, nameOf, [], measure), []);
  assert.deepEqual(
    regionNameLayout(named(groups, { node: null }), null, 40, nameOf, [], measure),
    [],
  );
});

test('regionNameLayout moves a name off a tile with a token and out from under a floating box', () => {
  const town = group('town', [
    [1, 1],
    [2, 1],
  ]);
  const [moved] = regionNameLayout(named([town]), null, 40, nameOf, ['1,1'], measure);
  assert.deepEqual(moved.box, { x: 180, y: 140, w: 38, h: 16 });
  const float = { x: 130, y: 130, w: 20, h: 20, float: true };
  const [clear] = regionNameLayout(
    named([town], { occluders: [float] }),
    null,
    40,
    nameOf,
    [],
    measure,
  );
  assert.deepEqual(clear.box, { x: 180, y: 140, w: 38, h: 16 });
  // A box that does not float, such as a docked mini-map column, moves no name.
  const [kept] = regionNameLayout(
    named([town], { occluders: [{ ...float, float: false }] }),
    null,
    40,
    nameOf,
    [],
    measure,
  );
  assert.deepEqual(kept.box, { x: 140, y: 140, w: 38, h: 16 });
});
