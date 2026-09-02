import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blockFor } from '../src/map/MapExits.js';
import { createTile } from '../src/map/TileGrid.js';
import { gridTiles } from './helpers/grid.js';

/**
 * A 6x6 parent whose tiles at (1,1) and (4,4) each link to "child" as two
 * one-cell blocks that do not touch.
 * @returns {import('../src/types/map.js').MapNode}
 */
function twoBlocks() {
  return {
    id: 'region',
    name: 'Coast',
    parentId: null,
    width: 6,
    height: 6,
    kind: 'region',
    environ: null,
    tiles: gridTiles(6, 6, (id, x, y) => {
      const linked = (x === 1 && y === 1) || (x === 4 && y === 4);
      return createTile(id, 'grass.svg', { childNodeId: linked ? 'child' : null });
    }),
  };
}

test('blockFor picks the block that holds the zoom-through tile', () => {
  const parent = twoBlocks();
  assert.deepEqual(blockFor(parent, 'child', '4,4')?.tileIds, ['4,4']);
  assert.deepEqual(blockFor(parent, 'child', '1,1')?.tileIds, ['1,1']);
});

test('blockFor falls back to the first block without a tile, or with a stray one', () => {
  const parent = twoBlocks();
  assert.deepEqual(blockFor(parent, 'child')?.tileIds, ['1,1']);
  assert.deepEqual(blockFor(parent, 'child', '0,0')?.tileIds, ['1,1']);
});

test('blockFor is null when no tile links to the child', () => {
  assert.equal(blockFor(twoBlocks(), 'nowhere', '1,1'), null);
});
