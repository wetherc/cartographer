import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampToViewport } from '../src/ui/ContextMenu.js';

test('a menu that fits stays at the requested position', () => {
  assert.deepEqual(clampToViewport(100, 200, 180, 90, 1280, 800), { x: 100, y: 200 });
});

test('a menu opened near the right/bottom edges pulls back inside the viewport', () => {
  const spot = clampToViewport(1250, 780, 180, 90, 1280, 800);
  assert.equal(spot.x, 1280 - 180 - 4);
  assert.equal(spot.y, 800 - 90 - 4);
});

test('a menu never crosses the top/left margins, even when oversized', () => {
  const spot = clampToViewport(-20, -20, 2000, 2000, 1280, 800);
  assert.equal(spot.x, 4);
  assert.equal(spot.y, 4);
});

test('a custom margin is respected on every edge', () => {
  const spot = clampToViewport(0, 9999, 100, 100, 500, 500, 10);
  assert.equal(spot.x, 10);
  assert.equal(spot.y, 500 - 100 - 10);
});
