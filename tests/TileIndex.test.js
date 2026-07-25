import test from 'node:test';
import assert from 'node:assert/strict';
import { tileIndex, tilePosition } from '../src/map/TileIndex.js';
import {
  createMapNode,
  createTile,
  setTile,
  getTile,
  updateTileMetadata,
} from '../src/map/TileGrid.js';
import { setTileRevealed } from '../src/map/FogOfWar.js';

function nodeWith(...ids) {
  let node = createMapNode('n', 'Node', null, 8, 8);
  for (const id of ids) node = setTile(node, createTile(id, 'grass.png'));
  return node;
}

test('tileIndex maps every tile id to its tile', () => {
  const node = nodeWith('0,0', '1,2', '3,3');
  const index = tileIndex(node);
  assert.equal(index.size, 3);
  assert.equal(index.get('1,2'), getTile(node, '1,2'));
  assert.equal(index.get('9,9'), undefined);
});

test('tileIndex is cached per node object', () => {
  const node = nodeWith('0,0');
  assert.equal(tileIndex(node), tileIndex(node));
});

test('a tile mutation yields a new node with a fresh index', () => {
  const node = nodeWith('0,0');
  const before = tileIndex(node);
  const updated = setTile(node, createTile('1,1', 'forest.png'));
  assert.notEqual(updated, node);
  const after = tileIndex(updated);
  assert.notEqual(after, before);
  assert.equal(before.size, 1); // the old node's index is untouched
  assert.equal(after.size, 2);
});

test('tilePosition reports the array position, undefined when absent', () => {
  const node = nodeWith('0,0', '1,1');
  assert.equal(tilePosition(node, '0,0'), 0);
  assert.equal(tilePosition(node, '1,1'), 1);
  assert.equal(tilePosition(node, '5,5'), undefined);
});

test('setTile replaces an existing tile in place, preserving order', () => {
  let node = nodeWith('0,0', '1,1', '2,2');
  node = setTile(node, createTile('1,1', 'water.png'));
  assert.deepEqual(
    node.tiles.map((t) => t.id),
    ['0,0', '1,1', '2,2'],
  );
  assert.equal(getTile(node, '1,1').imageRef, 'water.png');
});

test('updateTileMetadata is a no-op on a missing tile id', () => {
  const node = nodeWith('0,0');
  assert.equal(updateTileMetadata(node, '4,4', { notes: 'x' }), node);
});

test('updateTileMetadata merges metadata through the index path', () => {
  let node = nodeWith('0,0');
  node = updateTileMetadata(node, '0,0', { notes: 'a well', poiType: 'landmark' });
  const tile = getTile(node, '0,0');
  assert.equal(tile.metadata.notes, 'a well');
  assert.equal(tile.metadata.poiType, 'landmark');
  assert.equal(tile.metadata.discoverable, false); // untouched fields survive
});

test('setTileRevealed flips one tile and no-ops when already set or missing', () => {
  const node = nodeWith('0,0', '1,1');
  const revealed = setTileRevealed(node, '0,0', true);
  assert.notEqual(revealed, node);
  assert.equal(getTile(revealed, '0,0').revealed, true);
  assert.equal(getTile(revealed, '1,1').revealed, false);
  assert.equal(setTileRevealed(revealed, '0,0', true), revealed); // same state
  assert.equal(setTileRevealed(revealed, '9,9', true), revealed); // no tile
});
