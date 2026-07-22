import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paintTile, eraseTile, isInBounds } from '../src/map/TilePaint.js';
import { createMapNode, createTile, setTile, getTile } from '../src/map/TileGrid.js';

function node2x2() {
  return createMapNode('n', 'N', null, 2, 2);
}

test('isInBounds respects the node width/height', () => {
  const node = node2x2();
  assert.equal(isInBounds(node, '0,0'), true);
  assert.equal(isInBounds(node, '1,1'), true);
  assert.equal(isInBounds(node, '2,0'), false);
  assert.equal(isInBounds(node, '0,2'), false);
  assert.equal(isInBounds(node, 'poi'), false);
});

test('paintTile creates a new unrevealed tile with the given image', () => {
  const painted = paintTile(node2x2(), '0,0', 'grass.svg');
  const tile = getTile(painted, '0,0');
  assert.equal(tile.imageRef, 'grass.svg');
  assert.equal(tile.revealed, false);
});

test('paintTile over an existing tile keeps metadata, childNodeId, revealed', () => {
  let node = node2x2();
  node = setTile(
    node,
    createTile('1,1', 'old.svg', {
      revealed: true,
      childNodeId: 'region',
      metadata: { poiType: 'dungeon', discoverable: true, notes: 'crypt' },
    }),
  );
  const painted = paintTile(node, '1,1', 'new.svg');
  const tile = getTile(painted, '1,1');
  assert.equal(tile.imageRef, 'new.svg');
  assert.equal(tile.revealed, true);
  assert.equal(tile.childNodeId, 'region');
  assert.deepEqual(tile.metadata, { poiType: 'dungeon', discoverable: true, notes: 'crypt' });
});

test('paintTile out of bounds is a no-op', () => {
  const node = node2x2();
  assert.equal(paintTile(node, '5,5', 'grass.svg'), node);
});

test('eraseTile removes a tile and no-ops when absent', () => {
  let node = paintTile(node2x2(), '0,0', 'grass.svg');
  node = eraseTile(node, '0,0');
  assert.equal(getTile(node, '0,0'), undefined);
  assert.equal(eraseTile(node, '0,0'), node);
});
