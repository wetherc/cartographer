import { test } from 'node:test';
import assert from 'node:assert/strict';
import { labelSize } from '../src/map/CanvasText.js';
import {
  COORD_SCALE,
  MIN_LABELLED_TILE,
  coordLabelLayout,
  labelStride,
  visibleCoordLabels,
} from '../src/map/CoordLabels.js';
import { edgeExitBand, exitBandDepth, exitBandGeometry } from '../src/map/ExitBands.js';
import { fitSides, fitToExtent } from '../src/map/MapGeometry.js';
import { createMapNode } from '../src/map/TileGrid.js';

const view = { offsetX: 100, offsetY: 120, scale: 1, canvasWidth: 900, canvasHeight: 800 };
const node = { width: 10, height: 12 };

test('labelSize keeps its bounds in CSS px on a dense screen', () => {
  const scale = { factor: 0.3, min: 14, max: 42 };
  assert.equal(labelSize(20, scale), 14);
  assert.equal(labelSize(20, scale, 2), 28);
  assert.equal(labelSize(1000, scale, 2), 84);
});

test('coordLabelLayout returns null with no node or tiny tiles', () => {
  assert.equal(coordLabelLayout({ ...view, node: null }, 48), null);
  assert.equal(coordLabelLayout({ ...view, node, scale: 0.25 }, 48), null);
});

test('coordLabelLayout places the digits off the top and left edges', () => {
  const layout = coordLabelLayout({ ...view, node }, 48);
  assert.ok(layout);
  assert.equal(layout.fontSize, labelSize(48, COORD_SCALE));
  assert.equal(layout.colPinned, false);
  assert.equal(layout.rowPinned, false);
  assert.ok(layout.colY < view.offsetY);
  assert.ok(layout.rowX < view.offsetX);
  assert.deepEqual(layout.strips, [layout.columns, layout.rows]);
  assert.equal(layout.columns?.w, 480);
  assert.equal(layout.rows?.h, 576);
});

test('coordLabelLayout pins the digits and drops a strip off the canvas', () => {
  const pinned = coordLabelLayout({ ...view, node, offsetX: -2000, offsetY: 0 }, 48);
  assert.ok(pinned);
  assert.equal(pinned.colPinned, true);
  assert.equal(pinned.rowPinned, true);
  assert.equal(pinned.columns, null);
  assert.deepEqual(pinned.strips, [pinned.rows]);
  const below = coordLabelLayout({ ...view, node, offsetY: 900 }, 48);
  assert.equal(below?.rows, null);
});

test('a north or west band clears the coordinate digits', () => {
  const map = createMapNode('child', 'Thornhold', 'world', 10, 12);
  // The west gutter is wide enough for the band beside the row digits.
  const wide = { ...view, offsetX: 300 };
  for (const side of /** @type {const} */ (['north', 'west'])) {
    const exit = { kind: 'edge', side, targetNodeId: 'r', targetName: 'Saltmere' };
    const geom = exitBandGeometry(map, wide, 48, /** @type {any} */ (exit));
    const band = edgeExitBand(/** @type {any} */ (exit), geom);
    const layout = coordLabelLayout({ ...wide, node: map }, 48);
    const strip = side === 'north' ? layout?.columns : layout?.rows;
    assert.ok(strip);
    if (side === 'north') assert.ok(band.y + band.h <= strip.y);
    else assert.ok(band.x + band.w <= strip.x);
  }
});

test('a band with tiny tiles skips the digit gap', () => {
  const map = createMapNode('child', 'Thornhold', 'world', 10, 12);
  const exit = /** @type {const} */ ({
    kind: 'edge',
    side: 'north',
    targetNodeId: 'r',
    targetName: 'Saltmere',
  });
  const small = { ...view, scale: 0.25 };
  const band = edgeExitBand(exit, exitBandGeometry(map, small, 48, exit));
  assert.equal(band.y, view.offsetY - 10 - 26);
});

test('a band takes its sizes in CSS px on a dense screen', () => {
  const map = createMapNode('child', 'Thornhold', 'world', 10, 12);
  const exit = /** @type {const} */ ({
    kind: 'edge',
    side: 'south',
    targetNodeId: 'r',
    targetName: 'Saltmere',
  });
  const dense = exitBandGeometry(map, { ...view, scale: 0.3, pixelRatio: 2 }, 48, exit);
  const band = edgeExitBand(exit, dense);
  assert.equal(band.h, 52);
  assert.equal(band.fontSize, 24);
  assert.equal(exitBandDepth(), 26);
  assert.equal(exitBandDepth(2), 52);
});

test('fitSides adds room for north and south bands only', () => {
  const sides = fitSides({
    lead: 64,
    trail: 16,
    exitSides: ['north', 'south', 'east', 'west'],
    bandDepth: 26,
    canvasWidth: 900,
  });
  assert.deepEqual(sides, { top: 98, right: 16, bottom: 50, left: 64 });
  assert.deepEqual(fitSides({ lead: 64, trail: 16, canvasWidth: 900 }), {
    top: 64,
    right: 16,
    bottom: 16,
    left: 64,
  });
});

test('fitSides keeps the map clear of chrome at the top of the canvas', () => {
  const miniMap = { x: 12, y: 12, w: 150, h: 170 };
  const toolbar = { x: 600, y: 8, w: 290, h: 40 };
  const rightPanel = { x: 780, y: 10, w: 110, h: 200 };
  const low = { x: 12, y: 500, w: 150, h: 170 };
  const middle = { x: 300, y: 10, w: 50, h: 200 };
  const sides = fitSides({
    lead: 64,
    trail: 16,
    occluders: [miniMap, toolbar, rightPanel, low, middle],
    canvasWidth: 900,
  });
  assert.deepEqual(sides, { top: 80, right: 128, bottom: 16, left: 226 });
});

test('fitToExtent uses the sides it is given', () => {
  const sides = { top: 100, right: 10, bottom: 50, left: 200 };
  const fitted = fitToExtent(100, 100, 610, 450, { sides, maxScale: 10 });
  assert.equal(fitted.scale, 3);
  assert.equal(fitted.offsetX, 250);
  assert.equal(fitted.offsetY, 100);
});

test('coordLabelLayout moves the column digits below a wide box over them', () => {
  const toolbar = { x: 400, y: 0, w: 300, h: 50 };
  const map = { ...view, node, offsetY: 0 };
  const plain = coordLabelLayout(map, 48);
  const moved = coordLabelLayout({ ...map, occluders: [toolbar] }, 48);
  assert.ok(plain && moved?.columns);
  assert.ok(plain.colY < 50, 'the pinned digits start under the toolbar');
  assert.equal(moved.columns.y, 50);
  assert.equal(moved.colPinned, true);
  // A tall box and a wide box that misses the run leave the columns alone.
  const aside = [
    { x: 0, y: 0, w: 50, h: 200 },
    { x: 20, y: 0, w: 60, h: 30 },
    { x: 100, y: 400, w: 300, h: 30 },
  ];
  assert.equal(coordLabelLayout({ ...map, occluders: aside }, 48)?.colY, plain.colY);
});

test('coordLabelLayout moves the row digits right of a tall box over them', () => {
  const miniMap = { x: 0, y: 0, w: 170, h: 190 };
  const map = { ...view, node, offsetX: 0 };
  const moved = coordLabelLayout({ ...map, occluders: [miniMap] }, 48);
  assert.ok(moved?.rows);
  assert.equal(moved.rows.x, 170);
  assert.equal(moved.rowPinned, true);
  // A tall box below the rows, and a wide box, leave the rows alone.
  const plain = coordLabelLayout(map, 48);
  const aside = [
    { x: 0, y: 700, w: 50, h: 200 },
    { x: 0, y: 300, w: 400, h: 30 },
    { x: 800, y: 0, w: 50, h: 200 },
  ];
  assert.equal(coordLabelLayout({ ...map, occluders: aside }, 48)?.rowX, plain?.rowX);
});

test('fitSides leaves labelDepth below a wide box at the top', () => {
  const sides = fitSides({
    lead: 64,
    trail: 16,
    canvasWidth: 900,
    occluders: [{ x: 500, y: 4, w: 300, h: 40 }],
    labelDepth: 63,
  });
  assert.equal(sides.top, 107);
});

/** @param {any} v */
const labelsOf = (v) => visibleCoordLabels(v, /** @type {any} */ (coordLabelLayout(v, 48)));

test('visibleCoordLabels draws every label that fits in an open view', () => {
  const { columns, rows } = labelsOf({ ...view, node });
  assert.deepEqual(
    columns.map((c) => c.text),
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
  );
  assert.equal(columns[0].x, 124);
  assert.equal(rows.length, 12);
  assert.deepEqual(rows[0], { text: '1', y: 144 });
  // Labels whose centre is off the canvas are left out.
  const off = labelsOf({ ...view, node, canvasWidth: 300, canvasHeight: 300 });
  assert.deepEqual(
    off.columns.map((c) => c.text),
    ['1', '2', '3', '4'],
  );
  assert.deepEqual(
    off.rows.map((r) => r.text),
    ['1', '2', '3', '4'],
  );
  assert.deepEqual(
    visibleCoordLabels(
      { ...view, node: null },
      { size: 48, fontSize: 14, colPinned: true, rowPinned: true, columns: null, rows: null },
    ),
    { columns: [], rows: [] },
  );
});

test('visibleCoordLabels drops row labels above a column run moved below a wide box', () => {
  // The map starts at the canvas top, so the rows run from y = 24.
  const toolbar = { x: 400, y: 0, w: 300, h: 50 };
  const map = { ...view, node, offsetX: 100, offsetY: 0, occluders: [toolbar] };
  const layout = coordLabelLayout(map, 48);
  assert.ok(layout?.columns);
  const { rows } = visibleCoordLabels(map, layout);
  const strip = layout.columns.y + layout.columns.h;
  assert.ok(rows.length < 12);
  for (const r of rows)
    assert.ok(r.y - layout.fontSize * 0.6 >= strip, `row ${r.text} clears the strip`);
  assert.equal(rows[0].text, String(12 - rows.length + 1));
});

test('visibleCoordLabels drops column labels left of a row run moved right of a tall box', () => {
  const miniMap = { x: 0, y: 200, w: 170, h: 190 };
  const map = { ...view, node, offsetX: 0, offsetY: 120, occluders: [miniMap] };
  const layout = coordLabelLayout(map, 48);
  assert.ok(layout?.rows);
  const { columns, rows } = visibleCoordLabels(map, layout);
  const strip = layout.rows.x + layout.rows.w;
  assert.ok(columns.length < 10);
  for (const c of columns) assert.ok(c.x > strip, `column ${c.text} clears the strip`);
  // The columns are not pinned here, so every row label draws.
  assert.equal(rows.length, 12);
});

test('a floating box reserves no fit room and hides only the digits under it', () => {
  const miniMap = { x: 0, y: 0, w: 170, h: 190, float: true };
  assert.deepEqual(fitSides({ lead: 64, trail: 16, occluders: [miniMap], canvasWidth: 900 }), {
    top: 64,
    right: 16,
    bottom: 16,
    left: 64,
  });
  const map = { ...view, node, offsetX: 60, offsetY: 60, occluders: [miniMap] };
  const layout = coordLabelLayout(map, 48);
  assert.ok(layout);
  assert.equal(layout.rowPinned, false);
  const { columns, rows } = visibleCoordLabels(map, layout);
  assert.ok(columns.length > 0 && columns.length < 10);
  assert.ok(columns.every((c) => c.x > 170));
  assert.ok(rows.length > 0 && rows.length < 12);
  assert.ok(rows.every((r) => r.y > 190));
});

test('labelStride skips labels whose plates would overlap', () => {
  assert.equal(labelStride(20, 14, 48), 1);
  assert.equal(labelStride(23.8, 14, 20), 2);
  assert.equal(labelStride(23.8, 14, 13), 2);
  assert.equal(labelStride(32.2, 14, 13), 3);
});

test('small tiles label every second column and row, starting at 1', () => {
  // A 32 x 32 region fitted at 29% has tiles of about 14 buffer px, where a
  // two-digit plate at the 14 px font is wider than one tile.
  const region = { width: 32, height: 32 };
  const scale = 14 / 48;
  const small = { ...view, node: region, scale, offsetX: 40, offsetY: 40 };
  const layout = coordLabelLayout(small, 48);
  assert.ok(layout);
  const { columns, rows } = visibleCoordLabels(small, layout);
  assert.deepEqual(
    columns.slice(0, 6).map((c) => c.text),
    ['1', '3', '5', '7', '9', '11'],
  );
  assert.equal(rows[1].text, '3');
  // No two plates in a run overlap.
  const plate = (/** @type {string} */ t) => t.length * 14 * 0.6 + 14 * 0.5;
  for (let i = 1; i < columns.length; i++) {
    const gap = columns[i].x - columns[i - 1].x;
    assert.ok(gap >= (plate(columns[i].text) + plate(columns[i - 1].text)) / 2);
  }
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i].y - rows[i - 1].y >= 14 * 1.2);
  // Tiles one pixel under the threshold draw no labels.
  const tiny = { ...small, scale: (MIN_LABELLED_TILE - 1) / 48 };
  assert.equal(coordLabelLayout(tiny, 48), null);
});
