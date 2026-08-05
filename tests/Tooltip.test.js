import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tipPlacement } from '../src/ui/Tooltip.js';

const VIEWPORT = { width: 1000, height: 800 };

/**
 * A rectangle in the shape `getBoundingClientRect` returns.
 * @param {number} left @param {number} top @param {number} width @param {number} height
 */
function rect(left, top, width, height) {
  return { left, top, width, height, right: left + width, bottom: top + height };
}

test('the tooltip sits above its anchor, centered on it', () => {
  const place = tipPlacement(rect(400, 300, 100, 20), { width: 200, height: 40 }, VIEWPORT);
  assert.equal(place.side, 'above');
  // 8px of margin above the anchor's top edge, less the tooltip's own height.
  assert.equal(place.top, 300 - 40 - 8);
  // The centers line up: 400 + 100/2 === 350 + 200/2.
  assert.equal(place.left, 350);
});

test('an anchor near the top of the window flips the tooltip below it', () => {
  const place = tipPlacement(rect(400, 10, 100, 20), { width: 200, height: 40 }, VIEWPORT);
  assert.equal(place.side, 'below');
  assert.equal(place.top, 30 + 8);
});

test('an anchor with exactly enough room above keeps the tooltip above', () => {
  // An anchor 56px down leaves the tooltip's 40px plus a margin above it and
  // a margin below the window's edge, which is the tightest fit that stays up.
  const place = tipPlacement(rect(400, 56, 100, 20), { width: 200, height: 40 }, VIEWPORT);
  assert.equal(place.side, 'above');
  assert.equal(place.top, 8);
  // One pixel higher and it flips.
  assert.equal(
    tipPlacement(rect(400, 55, 100, 20), { width: 200, height: 40 }, VIEWPORT).side,
    'below',
  );
});

test('a tooltip clamps to the left and right edges of the window', () => {
  const left = tipPlacement(rect(0, 300, 24, 24), { width: 200, height: 40 }, VIEWPORT);
  assert.equal(left.left, 8);
  const right = tipPlacement(rect(976, 300, 24, 24), { width: 200, height: 40 }, VIEWPORT);
  assert.equal(right.left, 1000 - 200 - 8);
});

test('a tooltip wider than the window starts at the left margin', () => {
  const place = tipPlacement(rect(400, 300, 100, 20), { width: 1200, height: 40 }, VIEWPORT);
  assert.equal(place.left, 8);
});
