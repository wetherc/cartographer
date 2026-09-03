import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cellClientCenter, cursorSide, isCursorKey, nextCursor } from '../src/map/MapCursor.js';

test('isCursorKey recognizes the four arrow keys and nothing else', () => {
  for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
    assert.equal(isCursorKey(key), true, key);
  }
  assert.equal(isCursorKey('Enter'), false);
  assert.equal(isCursorKey('a'), false);
});

test('cursorSide names the side each arrow key heads off', () => {
  assert.equal(cursorSide('ArrowUp'), 'north');
  assert.equal(cursorSide('ArrowRight'), 'east');
  assert.equal(cursorSide('ArrowDown'), 'south');
  assert.equal(cursorSide('ArrowLeft'), 'west');
  assert.equal(cursorSide('Enter'), null);
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

test('nextCursor returns the start cell unchanged for a non-direction key', () => {
  assert.deepEqual(nextCursor({ x: 2, y: 2 }, 'Enter', 5, 5), { x: 2, y: 2 });
  // A null cursor with a bad key still resolves to the grid centre, unmoved.
  assert.deepEqual(nextCursor(null, 'Enter', 8, 6), { x: 4, y: 3 });
});

test('nextCursor clamps at the grid edges rather than leaving the map', () => {
  assert.deepEqual(nextCursor({ x: 0, y: 0 }, 'ArrowLeft', 4, 4), { x: 0, y: 0 });
  assert.deepEqual(nextCursor({ x: 0, y: 0 }, 'ArrowUp', 4, 4), { x: 0, y: 0 });
  assert.deepEqual(nextCursor({ x: 3, y: 3 }, 'ArrowRight', 4, 4), { x: 3, y: 3 });
  assert.deepEqual(nextCursor({ x: 3, y: 3 }, 'ArrowDown', 4, 4), { x: 3, y: 3 });
});

const view = { tileSize: 48, offsetX: 0, offsetY: 24, scale: 1 };

test('cellClientCenter puts the point at the middle of the cell', () => {
  const rect = { left: 0, top: 0, width: 300, height: 300 };
  assert.deepEqual(cellClientCenter({ x: 2, y: 0 }, view, rect, 300, 300), {
    clientX: 120,
    clientY: 48,
  });
});

test('cellClientCenter scales by the on-screen size and adds the element offset', () => {
  const rect = { left: 10, top: 20, width: 150, height: 150 };
  assert.deepEqual(cellClientCenter({ x: 2, y: 0 }, view, rect, 300, 300), {
    clientX: 70,
    clientY: 44,
  });
});

test('cellClientCenter keeps buffer pixels for a canvas with no laid-out size', () => {
  const rect = { left: 10, top: 20, width: 0, height: 0 };
  assert.deepEqual(cellClientCenter({ x: 2, y: 0 }, view, rect, 300, 300), {
    clientX: 130,
    clientY: 68,
  });
});
