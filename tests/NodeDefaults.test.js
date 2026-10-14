import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  markDefaulted,
  plainTile,
  withNodeDefaults,
  withTileDefaults,
} from '../src/map/NodeDefaults.js';
import { createTile } from '../src/map/TileGrid.js';

test('plainTile builds the tile withTileDefaults builds, in the same field order', () => {
  const tile = plainTile('1,2', 'grass.svg', ['road'], true, 'child');
  const expected = withTileDefaults(
    createTile('1,2', 'grass.svg', { overlayRef: ['road'], revealed: true, childNodeId: 'child' }),
  );
  assert.deepEqual(tile, expected);
  assert.deepEqual(Object.keys(tile), Object.keys(expected));
});

test('withNodeDefaults keeps a marked tile list and rebuilds an unmarked one', () => {
  const tiles = [plainTile('0,0', 'grass.svg', null, false, null)];
  const node = /** @type {any} */ ({ id: 'n', width: 1, height: 1, tiles });
  assert.notEqual(withNodeDefaults(node).tiles, tiles);
  assert.equal(markDefaulted(tiles), tiles);
  const kept = withNodeDefaults(node);
  assert.equal(kept.tiles, tiles);
  assert.equal(kept.tiles[0], tiles[0]);
});
