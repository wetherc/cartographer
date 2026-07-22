import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isCursorKey, nextCursor } from '../src/map/MapCursor.js';

test('isCursorKey recognizes the four arrow keys and nothing else', () => {
  for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
    assert.equal(isCursorKey(key), true, key);
  }
  assert.equal(isCursorKey('Enter'), false);
  assert.equal(isCursorKey('a'), false);
});

test('nextCursor starts a null cursor at the grid centre, then applies the move', () => {
  // Centre of 8x6 is (4,3); one step right lands on (5,3).
  assert.deepEqual(nextCursor(null, 'ArrowRight', 8, 6), { x: 5, y: 3 });
});

test('nextCursor moves one cell in the arrow direction', () => {
  assert.deepEqual(nextCursor({ x: 2, y: 2 }, 'ArrowUp', 5, 5), { x: 2, y: 1 });
  assert.deepEqual(nextCursor({ x: 2, y: 2 }, 'ArrowDown', 5, 5), { x: 2, y: 3 });
  assert.deepEqual(nextCursor({ x: 2, y: 2 }, 'ArrowLeft', 5, 5), { x: 1, y: 2 });
  assert.deepEqual(nextCursor({ x: 2, y: 2 }, 'ArrowRight', 5, 5), { x: 3, y: 2 });
});

test('nextCursor clamps at the grid edges rather than leaving the map', () => {
  assert.deepEqual(nextCursor({ x: 0, y: 0 }, 'ArrowLeft', 4, 4), { x: 0, y: 0 });
  assert.deepEqual(nextCursor({ x: 0, y: 0 }, 'ArrowUp', 4, 4), { x: 0, y: 0 });
  assert.deepEqual(nextCursor({ x: 3, y: 3 }, 'ArrowRight', 4, 4), { x: 3, y: 3 });
  assert.deepEqual(nextCursor({ x: 3, y: 3 }, 'ArrowDown', 4, 4), { x: 3, y: 3 });
});
