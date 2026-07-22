import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeEntryTile } from '../src/map/EntryPoint.js';

// 8x8 child region. Its block sits at parent coords x 4..7, y 4..7.
const W = 8;
const H = 8;
const block = { minX: 4, minY: 4, maxX: 7, maxY: 7 };

test('head-on at the west wall lands on the inner west edge, aligned to entry', () => {
  // Aligned with the block on y (within 4..7), west of it on x.
  assert.equal(computeEntryTile(W, H, block, { x: 0, y: 4 }), '0,0');
  assert.equal(computeEntryTile(W, H, block, { x: 0, y: 7 }), '0,7');
  assert.equal(computeEntryTile(W, H, block, { x: 0, y: 6 }), '0,5');
});

test('head-on at the east wall lands on the inner east edge', () => {
  assert.equal(computeEntryTile(W, H, block, { x: 20, y: 4 }), '7,0');
});

test('head-on at the north wall lands on the inner north edge, aligned to entry', () => {
  assert.equal(computeEntryTile(W, H, block, { x: 6, y: 0 }), '5,0');
});

test('head-on at the south wall lands on the inner south edge', () => {
  assert.equal(computeEntryTile(W, H, block, { x: 4, y: 20 }), '0,7');
});

test('diagonal past a corner lands on the matching inner corner', () => {
  assert.equal(computeEntryTile(W, H, block, { x: 0, y: 0 }), '0,0'); // NW
  assert.equal(computeEntryTile(W, H, block, { x: 20, y: 0 }), '7,0'); // NE
  assert.equal(computeEntryTile(W, H, block, { x: 0, y: 20 }), '0,7'); // SW
  assert.equal(computeEntryTile(W, H, block, { x: 20, y: 20 }), '7,7'); // SE
});

test('falls back to centre when the party stands inside the block footprint', () => {
  assert.equal(computeEntryTile(W, H, block, { x: 5, y: 5 }), '4,4');
});

test('falls back to centre with no block or no party', () => {
  assert.equal(computeEntryTile(W, H, null, { x: 0, y: 0 }), '4,4');
  assert.equal(computeEntryTile(W, H, block, null), '4,4');
});

test('a single-tile block projects a head-on approach to the wall midpoint', () => {
  const one = { minX: 5, minY: 5, maxX: 5, maxY: 5 };
  // West of a 1-tile block, aligned on y: west edge, mid height.
  assert.equal(computeEntryTile(W, H, one, { x: 0, y: 5 }), '0,3');
});
