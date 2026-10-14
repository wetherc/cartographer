import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  boundsOf,
  boxesOverlap,
  footprintCenter,
  keepClearOfEdges,
  labelCandidates,
  overlapArea,
  placeLabels,
} from '../src/map/RegionLabels.js';

/** The screen box of cell (x, y) at 20 px tiles. */
const cell = (/** @type {number} */ x, /** @type {number} */ y) => ({
  x: x * 20,
  y: y * 20,
  w: 20,
  h: 20,
});
const room = { above: true, below: true };

test('boxesOverlap is true for crossing boxes and false for boxes that only touch', () => {
  const a = { x: 0, y: 0, w: 10, h: 10 };
  assert.equal(boxesOverlap(a, { x: 5, y: 5, w: 10, h: 10 }), true);
  assert.equal(boxesOverlap(a, { x: 10, y: 0, w: 10, h: 10 }), false);
  assert.equal(boxesOverlap(a, { x: 0, y: 10, w: 10, h: 10 }), false);
  assert.equal(boxesOverlap(a, { x: 11, y: 0, w: 10, h: 10 }, 2), true);
});

test('boundsOf covers every box', () => {
  assert.deepEqual(boundsOf([cell(1, 2), cell(3, 1)]), { x: 20, y: 20, w: 60, h: 40 });
});

test('footprintCenter is the mean of the cell centers when it lies in the region', () => {
  assert.deepEqual(footprintCenter([cell(0, 0), cell(1, 0)]), { x: 20, y: 10 });
  assert.deepEqual(footprintCenter([cell(2, 2)]), { x: 50, y: 50 });
});

test('footprintCenter falls back to the nearest cell for a region with a hole', () => {
  // A ring of 8 cells around (1, 1): the mean is the empty middle cell.
  const ring = [
    [0, 0],
    [1, 0],
    [2, 0],
    [0, 1],
    [2, 1],
    [0, 2],
    [1, 2],
    [2, 2],
  ].map(([x, y]) => cell(x, y));
  assert.deepEqual(footprintCenter(ring), { x: 30, y: 10 });
});

test('labelCandidates centers on the region, then above, then below', () => {
  const cells = [cell(1, 1), cell(2, 1)];
  assert.deepEqual(labelCandidates(cells, 30, 10, room), [
    { x: 25, y: 25, w: 30, h: 10 },
    { x: 25, y: 10, w: 30, h: 10 },
    { x: 25, y: 40, w: 30, h: 10 },
  ]);
  assert.deepEqual(labelCandidates(cells, 30, 10, { above: false, below: false }), [
    { x: 25, y: 25, w: 30, h: 10 },
  ]);
});

test('placeLabels centers each name that has room', () => {
  const a = [cell(0, 0)];
  const b = [cell(5, 0)];
  const boxes = placeLabels([
    { candidates: labelCandidates(a, 16, 10, room), cells: a },
    { candidates: labelCandidates(b, 16, 10, room), cells: b },
  ]);
  assert.deepEqual(boxes, [
    { x: 2, y: 5, w: 16, h: 10 },
    { x: 102, y: 5, w: 16, h: 10 },
  ]);
});

test('placeLabels leaves out a name wider than its building that would cover the next one', () => {
  const house = [cell(1, 1)];
  const academy = [cell(2, 1)];
  const no = { above: false, below: false };
  const boxes = placeLabels([
    { candidates: labelCandidates(house, 50, 10, no), cells: house },
    { candidates: labelCandidates(academy, 16, 10, no), cells: academy },
  ]);
  assert.deepEqual(boxes, [null, { x: 42, y: 25, w: 16, h: 10 }]);
});

test('placeLabels moves a name above its region when the center is taken', () => {
  const a = [cell(1, 1)];
  const blocked = [cell(1, 1)];
  const [box] = placeLabels(
    [{ candidates: labelCandidates(a, 16, 10, room), cells: a }],
    0,
    blocked,
  );
  assert.deepEqual(box, { x: 22, y: 10, w: 16, h: 10 });
});

test('placeLabels leaves a gap between two names and the order sets the priority', () => {
  const near = [{ x: 0, y: 0, w: 10, h: 10 }];
  const next = [{ x: 11, y: 0, w: 10, h: 10 }];
  const labels = [
    { candidates: near, cells: [] },
    { candidates: next, cells: [] },
  ];
  assert.notEqual(placeLabels(labels)[1], null);
  assert.equal(placeLabels(labels, 2)[1], null);
});

test('placeLabels ignores a far region whose bounds the name does not reach', () => {
  const far = [cell(9, 9), cell(9, 8)];
  const a = [cell(0, 0)];
  const boxes = placeLabels([
    { candidates: [], cells: far },
    { candidates: labelCandidates(a, 16, 10, room), cells: a },
  ]);
  assert.deepEqual(boxes, [null, { x: 2, y: 5, w: 16, h: 10 }]);
});

test('placeLabels checks the cells of an L-shaped region, not only its bounds', () => {
  // The bounds of the L cover (1, 0), but the L has no cell there.
  const ell = [cell(0, 0), cell(0, 1), cell(1, 1)];
  const free = [{ x: 22, y: 2, w: 16, h: 10 }];
  assert.deepEqual(
    placeLabels([
      { candidates: [], cells: ell },
      { candidates: free, cells: [] },
    ])[1],
    free[0],
  );
});

test('keepClearOfEdges leaves a name inside the map area where it is', () => {
  const box = { x: 50, y: 60, w: 80, h: 16 };
  const region = { x: 50, y: 60, w: 40, h: 40 };
  assert.deepEqual(keepClearOfEdges(box, region, { x: 30, y: 20 }), box);
});

test('keepClearOfEdges slides a name off the row and column digits', () => {
  const box = { x: 10, y: 5, w: 80, h: 16 };
  const region = { x: 10, y: 5, w: 40, h: 40 };
  assert.deepEqual(keepClearOfEdges(box, region, { x: 30, y: 20 }), {
    x: 30,
    y: 20,
    w: 80,
    h: 16,
  });
});

test('keepClearOfEdges leaves out a name whose region is past an edge', () => {
  const box = { x: -60, y: 100, w: 120, h: 16 };
  assert.equal(keepClearOfEdges(box, { x: -60, y: 100, w: 40, h: 40 }, { x: 0, y: 0 }), null);
  // The region's far edge on the strip edge counts as out of view.
  assert.equal(keepClearOfEdges(box, { x: -10, y: 100, w: 40, h: 40 }, { x: 30, y: 0 }), null);
  const above = { x: 100, y: -20, w: 80, h: 16 };
  assert.equal(keepClearOfEdges(above, { x: 100, y: -40, w: 40, h: 40 }, { x: 0, y: 0 }), null);
});

test('overlapArea is the area two boxes share, or 0', () => {
  assert.equal(overlapArea(cell(0, 0), { x: 10, y: 15, w: 20, h: 20 }), 50);
  assert.equal(overlapArea(cell(0, 0), cell(1, 0)), 0);
  assert.equal(overlapArea(cell(0, 0), cell(0, 3)), 0);
});

test('placeLabels lets a name run over a small part of a large region', () => {
  /** @type {{ x: number, y: number, w: number, h: number }[]} */
  const province = [];
  for (let x = 0; x < 6; x++)
    for (let y = 0; y < 6; y++) if (x !== 2 || y !== 2) province.push(cell(x, y));
  const vale = [cell(2, 2)];
  const boxes = placeLabels([
    { candidates: [], cells: province },
    { candidates: labelCandidates(vale, 50, 10, room), cells: vale },
  ]);
  assert.deepEqual(boxes[1], { x: 25, y: 45, w: 50, h: 10 });
});
