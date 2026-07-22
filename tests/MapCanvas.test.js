import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCoords, tileRect, screenToTile, clampZoom, clientToBuffer, fitToExtent } from '../src/map/MapCanvas.js';

test('parseCoords reads "x,y" tile ids', () => {
  assert.deepEqual(parseCoords('3,4'), { x: 3, y: 4 });
  assert.deepEqual(parseCoords('0,0'), { x: 0, y: 0 });
});

test('parseCoords rejects non-coordinate ids', () => {
  assert.equal(parseCoords('poi'), null);
  assert.equal(parseCoords('t1'), null);
  assert.equal(parseCoords('-1,2'), null);
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
