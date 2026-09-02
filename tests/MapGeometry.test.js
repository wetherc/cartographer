import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCoords,
  tileIdAt,
  inBounds,
  tileRect,
  screenToTile,
  clampZoom,
  clientToBuffer,
  bufferScale,
  blockRect,
  cellEdge,
  newBlockRect,
  fitToExtent,
  maskAt,
  READABLE_TILE_PX,
  readableScale,
  NEIGHBORS4,
  NEIGHBORS8,
} from '../src/map/MapGeometry.js';
import { anyRevealed } from '../src/map/MapRenderer.js';

test('the neighbour offsets are the four orthogonals, plus the diagonals', () => {
  assert.deepEqual(NEIGHBORS4, [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]);
  // The generators run these under a seeded RNG, so the order is part of what a
  // seed reproduces: NEIGHBORS8 has to extend NEIGHBORS4 rather than reshuffle it.
  assert.deepEqual(NEIGHBORS8.slice(0, 4), NEIGHBORS4);
  assert.deepEqual(NEIGHBORS8.slice(4), [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ]);
});

test('maskAt tests a flat grid cell against a value', () => {
  const cells = ['a', 'b', 'c', 'd', 'e', 'f'];
  const isB = maskAt(cells, 3, 2, 'b');
  assert.equal(isB(1, 0), true);
  assert.equal(isB(0, 0), false);
  assert.equal(maskAt(cells, 3, 2, 'f')(2, 1), true);
});

test('maskAt reads false off the grid instead of wrapping a row', () => {
  const isX = maskAt(['x', 'o', 'o', 'x'], 2, 2, 'x');
  assert.equal(isX(-1, 0), false); // would be index -1
  assert.equal(isX(2, 0), false); // would wrap onto row 1
  assert.equal(isX(0, -1), false);
  assert.equal(isX(0, 2), false);
});

test('maskAt reads the live array, so a caller may fill the grid as it goes', () => {
  const cells = [false, false];
  const isSet = maskAt(cells, 2, 1, true);
  assert.equal(isSet(1, 0), false);
  cells[1] = true;
  assert.equal(isSet(1, 0), true);
});

test('parseCoords reads "x,y" tile ids', () => {
  assert.deepEqual(parseCoords('3,4'), { x: 3, y: 4 });
  assert.deepEqual(parseCoords('0,0'), { x: 0, y: 0 });
});

test('parseCoords rejects non-coordinate ids', () => {
  assert.equal(parseCoords('poi'), null);
  assert.equal(parseCoords('t1'), null);
  assert.equal(parseCoords('-1,2'), null);
});

test('tileIdAt builds the id parseCoords reads back', () => {
  assert.equal(tileIdAt(3, 4), '3,4');
  assert.equal(tileIdAt(0, 0), '0,0');
  assert.deepEqual(parseCoords(tileIdAt(12, 34)), { x: 12, y: 34 });
});

test('inBounds accepts cells inside a node extent and rejects the rest', () => {
  const node = /** @type {any} */ ({ width: 4, height: 3 });
  assert.equal(inBounds(node, 0, 0), true);
  assert.equal(inBounds(node, 3, 2), true);
  assert.equal(inBounds(node, 4, 2), false);
  assert.equal(inBounds(node, 3, 3), false);
  assert.equal(inBounds(node, -1, 0), false);
  assert.equal(inBounds(node, 0, -1), false);
});

test('tileRect places a tile at scale 1 with no offset', () => {
  assert.deepEqual(tileRect(2, 3, 48, 0, 0, 1), { sx: 96, sy: 144, size: 48 });
});

test('tileRect accounts for pan offset and zoom scale', () => {
  assert.deepEqual(tileRect(2, 3, 48, 10, -20, 2), { sx: 202, sy: 268, size: 96 });
});

test('screenToTile is the inverse of tileRect', () => {
  const { sx, sy, size } = tileRect(5, 7, 48, 10, -20, 2);
  assert.deepEqual(screenToTile(sx, sy, 48, 10, -20, 2), { x: 5, y: 7 });
  assert.deepEqual(screenToTile(sx + size / 2, sy + size / 2, 48, 10, -20, 2), { x: 5, y: 7 });
});

test('clampZoom keeps scale within min/max', () => {
  assert.equal(clampZoom(0.1, 0.25, 4), 0.25);
  assert.equal(clampZoom(10, 0.25, 4), 4);
  assert.equal(clampZoom(1.5, 0.25, 4), 1.5);
});

test('clientToBuffer returns raw offset when buffer matches CSS size', () => {
  const rect = { left: 10, top: 20, width: 720, height: 540 };
  const p = clientToBuffer(370, 290, rect, 720, 540);
  assert.deepEqual(p, { x: 360, y: 270, scaleX: 1, scaleY: 1 });
});

test('clientToBuffer scales client coords up when the canvas is CSS-shrunk', () => {
  // Buffer is 720x540 but rendered at half size (360x270): a click at the CSS
  // center must map to the buffer center, not half of it.
  const rect = { left: 0, top: 0, width: 360, height: 270 };
  const p = clientToBuffer(180, 135, rect, 720, 540);
  assert.deepEqual(p, { x: 360, y: 270, scaleX: 2, scaleY: 2 });
});

test('clientToBuffer avoids division by zero on a zero-size rect', () => {
  const p = clientToBuffer(5, 5, { left: 0, top: 0, width: 0, height: 0 }, 720, 540);
  assert.deepEqual(p, { x: 5, y: 5, scaleX: 1, scaleY: 1 });
});

test('bufferScale is the ratio clientToBuffer reports', () => {
  const rect = { left: 0, top: 0, width: 360, height: 270 };
  assert.deepEqual(bufferScale(rect, 720, 540), { scaleX: 2, scaleY: 2 });
  assert.deepEqual(bufferScale({ width: 0, height: 0 }, 720, 540), { scaleX: 1, scaleY: 1 });
});

test('cellEdge rounds each grid line to a whole pixel', () => {
  assert.equal(cellEdge(0, 48, 10), 10);
  assert.equal(cellEdge(3, 48, 10), 154);
  // Fractional zoom: 2 * 17.4 + 0.25 = 35.05 rounds down, 3 * 17.4 + 0.25 =
  // 52.45 rounds down too, so neighbor cells can differ in width by a pixel.
  assert.equal(cellEdge(2, 17.4, 0.25), 35);
  assert.equal(cellEdge(3, 17.4, 0.25), 52);
});

test('adjacent cells built from cellEdge share their boundary exactly', () => {
  const size = 17.4;
  const offset = 3.7;
  for (let x = 0; x < 10; x++) {
    const left = cellEdge(x, size, offset);
    const right = cellEdge(x + 1, size, offset);
    assert.equal(Number.isInteger(left), true);
    assert.equal(Number.isInteger(right), true);
    // A cell ends where the next begins: widths are 17 or 18, never a gap.
    const w = right - left;
    assert.equal(w === 17 || w === 18, true);
  }
});

test('blockRect spans the cell extent at the current pan and zoom', () => {
  const view = { offsetX: 10, offsetY: -20, canvasWidth: 800, canvasHeight: 600 };
  const rect = blockRect(newBlockRect(), { minX: 1, minY: 2, maxX: 2, maxY: 4 }, view, 48);
  assert.deepEqual(rect, { x: 58, y: 76, w: 96, h: 144, visible: true });
});

test('blockRect edges align with cellEdge at a fractional zoom', () => {
  const view = { offsetX: 3.7, offsetY: -1.2, canvasWidth: 800, canvasHeight: 600 };
  const size = 17.4;
  const rect = blockRect(newBlockRect(), { minX: 1, minY: 2, maxX: 2, maxY: 4 }, view, size);
  assert.equal(rect.x, cellEdge(1, size, view.offsetX));
  assert.equal(rect.y, cellEdge(2, size, view.offsetY));
  assert.equal(rect.x + rect.w, cellEdge(3, size, view.offsetX));
  assert.equal(rect.y + rect.h, cellEdge(5, size, view.offsetY));
});

test('blockRect reports a block off any canvas edge as not visible', () => {
  const view = { offsetX: 0, offsetY: 0, canvasWidth: 400, canvasHeight: 300 };
  const bounds = { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  const out = newBlockRect();
  assert.equal(blockRect(out, bounds, { ...view, offsetX: -200 }, 48).visible, false);
  assert.equal(blockRect(out, bounds, { ...view, offsetY: -200 }, 48).visible, false);
  assert.equal(blockRect(out, bounds, { ...view, offsetX: 500 }, 48).visible, false);
  assert.equal(blockRect(out, bounds, { ...view, offsetY: 400 }, 48).visible, false);
  // Straddling an edge still draws: the visible part has to paint.
  assert.equal(blockRect(out, bounds, { ...view, offsetX: -50 }, 48).visible, true);
});

test('blockRect fills the caller-owned rect rather than allocating', () => {
  const out = newBlockRect();
  const view = { offsetX: 0, offsetY: 0, canvasWidth: 800, canvasHeight: 600 };
  assert.equal(blockRect(out, { minX: 0, minY: 0, maxX: 0, maxY: 0 }, view, 48), out);
});

test('anyRevealed gates a block on its own tiles, and passes everything with fog off', () => {
  const revealed = new Set(['1,1']);
  assert.equal(anyRevealed(['0,0', '1,1'], revealed), true);
  assert.equal(anyRevealed(['0,0', '2,2'], revealed), false);
  assert.equal(anyRevealed([], revealed), false);
  assert.equal(anyRevealed(['0,0'], null), true);
});

test('fitToExtent centers a wide extent, limited by the width axis', () => {
  // 384x288 extent into a 1024x576 buffer with 24px padding: height is the
  // tighter axis ((576-48)/288 = 1.833... vs (1024-48)/384 = 2.541...).
  const fitted = fitToExtent(384, 288, 1024, 576, { padding: 24 });
  assert.equal(fitted.scale, (576 - 48) / 288);
  assert.equal(fitted.offsetX, (1024 - 384 * fitted.scale) / 2);
  assert.equal(fitted.offsetY, (576 - 288 * fitted.scale) / 2);
});

test('fitToExtent clamps the scale to the allowed zoom range', () => {
  const tiny = fitToExtent(4800, 4800, 480, 480, { padding: 0, minScale: 0.25, maxScale: 4 });
  assert.equal(tiny.scale, 0.25);
  const huge = fitToExtent(10, 10, 1000, 1000, { padding: 0, minScale: 0.25, maxScale: 4 });
  assert.equal(huge.scale, 4);
  assert.deepEqual({ x: huge.offsetX, y: huge.offsetY }, { x: 480, y: 480 });
});

test('fitToExtent falls back to identity on a degenerate extent or buffer', () => {
  assert.deepEqual(fitToExtent(0, 100, 500, 500), { scale: 1, offsetX: 0, offsetY: 0 });
  assert.deepEqual(fitToExtent(100, 100, 0, 500), { scale: 1, offsetX: 0, offsetY: 0 });
});

test('readableScale is the zoom at which a tile draws READABLE_TILE_PX wide', () => {
  assert.equal(readableScale(64), READABLE_TILE_PX / 64);
  assert.equal(readableScale(32), 1);
  assert.equal(readableScale(0), 0);
});

test('fitToExtent keeps the whole-map fit when it is already readable', () => {
  const plain = fitToExtent(384, 288, 1024, 576, { padding: 24 });
  const floored = fitToExtent(384, 288, 1024, 576, { padding: 24, readableScale: 0.5 });
  assert.deepEqual(floored, plain);
});

test('fitToExtent holds the readable floor and anchors the overflowing axis at the padding', () => {
  // A 1408x1408 extent (22 tiles of 64) in a 600x600 buffer with 64px
  // padding fits whole at 472/1408, under the 0.5 floor. The floor wins,
  // the map overflows both axes, and the view starts at the padding.
  const fitted = fitToExtent(1408, 1408, 600, 600, { padding: 64, readableScale: 0.5 });
  assert.equal(fitted.scale, 0.5);
  assert.deepEqual({ x: fitted.offsetX, y: fitted.offsetY }, { x: 64, y: 64 });
  // A wide map in a tall buffer overflows only the width. The height still centers.
  const wide = fitToExtent(1408, 320, 600, 900, { padding: 64, readableScale: 0.5 });
  assert.equal(wide.scale, 0.5);
  assert.equal(wide.offsetX, 64);
  assert.equal(wide.offsetY, (900 - 320 * 0.5) / 2);
});

test('the readable floor still respects the zoom range', () => {
  const capped = fitToExtent(4800, 4800, 480, 480, {
    padding: 0,
    minScale: 0.25,
    maxScale: 4,
    readableScale: 8,
  });
  assert.equal(capped.scale, 4);
});
