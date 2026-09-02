import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  describeTile,
  displayCoords,
  fromDisplay,
  tileIdFromDisplay,
  toDisplay,
} from '../src/map/TileCoords.js';

test('a shown number is one more than the stored index, and back', () => {
  assert.equal(toDisplay(0), 1);
  assert.equal(toDisplay(17), 18);
  assert.equal(fromDisplay(1), 0);
  assert.equal(fromDisplay(toDisplay(9)), 9);
});

test('displayCoords reads a tile id as a 1-based column and row', () => {
  assert.deepEqual(displayCoords('0,0'), { column: 1, row: 1 });
  assert.deepEqual(displayCoords('18,15'), { column: 19, row: 16 });
});

test('displayCoords gives null for an id that is not a grid coordinate', () => {
  assert.equal(displayCoords('legend'), null);
  assert.equal(displayCoords(''), null);
});

test('describeTile names the column and row as a GM reads them', () => {
  assert.equal(describeTile('0,0'), 'column 1, row 1');
  assert.equal(describeTile('18,15'), 'column 19, row 16');
});

test('describeTile shows a non-grid id as it is', () => {
  assert.equal(describeTile('legend'), 'legend');
});

test('tileIdFromDisplay is the inverse of displayCoords', () => {
  assert.equal(tileIdFromDisplay(1, 1), '0,0');
  assert.equal(tileIdFromDisplay(19, 16), '18,15');
  const shown = displayCoords('7,2');
  assert.ok(shown);
  assert.equal(tileIdFromDisplay(shown.column, shown.row), '7,2');
});
