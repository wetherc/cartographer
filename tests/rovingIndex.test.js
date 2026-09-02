import { test } from 'node:test';
import assert from 'node:assert/strict';
import { columnsFromTops, rovingTarget } from '../src/ui/rovingIndex.js';

test('Right and Left step one item and wrap at the ends of the list', () => {
  assert.equal(rovingTarget(0, 'ArrowRight', 12, 5), 1);
  assert.equal(rovingTarget(11, 'ArrowRight', 12, 5), 0);
  assert.equal(rovingTarget(3, 'ArrowLeft', 12, 5), 2);
  assert.equal(rovingTarget(0, 'ArrowLeft', 12, 5), 11);
});

test('Down and Up step one rendered row and stop at the first and last row', () => {
  assert.equal(rovingTarget(1, 'ArrowDown', 12, 5), 6);
  assert.equal(rovingTarget(6, 'ArrowDown', 12, 5), 11);
  assert.equal(rovingTarget(8, 'ArrowDown', 12, 5), 8, 'no row below holds the column');
  assert.equal(rovingTarget(11, 'ArrowDown', 12, 5), 11);
  assert.equal(rovingTarget(7, 'ArrowUp', 12, 5), 2);
  assert.equal(rovingTarget(2, 'ArrowUp', 12, 5), 2);
});

test('Home and End go to the first and last item', () => {
  assert.equal(rovingTarget(7, 'Home', 12, 5), 0);
  assert.equal(rovingTarget(7, 'End', 12, 5), 11);
});

test('a key the grid does not own returns null', () => {
  assert.equal(rovingTarget(3, 'Enter', 12, 5), null);
  assert.equal(rovingTarget(3, 'a', 12, 5), null);
});

test('an empty list has nowhere to move', () => {
  assert.equal(rovingTarget(0, 'ArrowRight', 0, 5), null);
  assert.equal(rovingTarget(0, 'Home', 0, 5), null);
});

test('a column count under one is treated as one', () => {
  assert.equal(rovingTarget(2, 'ArrowDown', 6, 0), 3);
  assert.equal(rovingTarget(2, 'ArrowUp', 6, -4), 1);
});

test('columnsFromTops counts the items that share the first row', () => {
  assert.equal(columnsFromTops([0, 0, 0, 40, 40, 40, 80]), 3);
  assert.equal(columnsFromTops([0, 0, 0, 0]), 4, 'a single row is all columns');
  assert.equal(columnsFromTops([0, 40, 80]), 1);
  assert.equal(columnsFromTops([]), 1);
});
