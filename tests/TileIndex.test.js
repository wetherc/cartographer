import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cellPosition,
  tileAt,
  tileAtXY,
  tilePosition,
  withTileAppended,
  withTileReplaced,
  withTilesReplaced,
} from '../src/map/TileIndex.js';
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

test('tileAt resolves every tile id, undefined for one the node lacks', () => {
  const node = nodeWith('0,0', '1,2', '3,3');
  assert.equal(tileAt(node, '1,2'), node.tiles[1]);
  assert.equal(tileAt(node, '9,9'), undefined);
});

test('tilePosition reports the array position, undefined when absent', () => {
  const node = nodeWith('0,0', '1,1');
  assert.equal(tilePosition(node, '0,0'), 0);
  assert.equal(tilePosition(node, '1,1'), 1);
  assert.equal(tilePosition(node, '5,5'), undefined);
});

test('tileAtXY resolves by coordinate and rejects cells outside the extent', () => {
  const node = nodeWith('0,0', '4,6');
  assert.equal(tileAtXY(node, 4, 6), getTile(node, '4,6'));
  assert.equal(tileAtXY(node, 1, 1), undefined); // empty cell
  assert.equal(tileAtXY(node, 8, 0), undefined); // past the width
  assert.equal(tileAtXY(node, 0, -1), undefined);
});

test('a tile whose id is not a grid coordinate has no cell position', () => {
  const node = setTile(createMapNode('n', 'Node', null, 4, 4), createTile('loose', 'grass.png'));
  assert.equal(tileAt(node, 'loose')?.imageRef, 'grass.png');
  assert.equal(cellPosition(node, 0, 0), undefined);
});

test('a node with no usable extent still resolves coordinates through its ids', () => {
  const node = setTile(createMapNode('n', 'Node', null, 0, 0), createTile('2,3', 'grass.png'));
  // cellPosition's own bounds check rejects everything on a zero extent, so the
  // fallback is exercised through a node whose extent is too large to map.
  const huge = { ...createMapNode('h', 'Huge', null, 4000, 4000), tiles: node.tiles };
  assert.equal(tileAtXY(huge, 2, 3)?.imageRef, 'grass.png');
  assert.equal(tileAtXY(huge, 2, 4), undefined);
});

test('a tile mutation yields a new node whose lookups see the change', () => {
  const node = nodeWith('0,0');
  const updated = setTile(node, createTile('1,1', 'forest.png'));
  assert.notEqual(updated, node);
  assert.equal(tileAt(node, '1,1'), undefined); // the old node is untouched
  assert.equal(tileAt(updated, '1,1')?.imageRef, 'forest.png');
  assert.equal(tileAtXY(updated, 1, 1)?.imageRef, 'forest.png');
});

test('setTile replaces an existing tile in place, preserving order', () => {
  let node = nodeWith('0,0', '1,1', '2,2');
  node = setTile(node, createTile('1,1', 'water.png'));
  assert.deepEqual(
    node.tiles.map((t) => t.id),
    ['0,0', '1,1', '2,2'],
  );
  assert.equal(getTile(node, '1,1').imageRef, 'water.png');
  assert.equal(tileAtXY(node, 1, 1).imageRef, 'water.png');
});

test('a long run of appends stays correct past the flatten threshold', () => {
  let node = createMapNode('n', 'Node', null, 30, 30);
  for (let y = 0; y < 30; y++) {
    for (let x = 0; x < 30; x++) {
      node = setTile(node, createTile(`${x},${y}`, `t-${x}-${y}.png`));
      // Read through the layout every step, so a stale override would surface
      // here rather than only in the final state.
      assert.equal(tileAtXY(node, x, y).imageRef, `t-${x}-${y}.png`);
    }
  }
  assert.equal(node.tiles.length, 900);
  assert.equal(tileAtXY(node, 7, 21).imageRef, 't-7-21.png');
  assert.equal(tilePosition(node, '7,21'), 21 * 30 + 7);
});

test('two appends branching off one node do not see each other', () => {
  const base = nodeWith('0,0');
  const left = setTile(base, createTile('1,0', 'left.png'));
  const right = setTile(base, createTile('2,0', 'right.png'));

  assert.equal(tileAt(left, '1,0')?.imageRef, 'left.png');
  assert.equal(tileAt(left, '2,0'), undefined);
  assert.equal(tileAt(right, '2,0')?.imageRef, 'right.png');
  assert.equal(tileAt(right, '1,0'), undefined);
  assert.equal(tileAtXY(right, 1, 0), undefined);
});

test('an append after an erase re-indexes rather than reusing shifted positions', () => {
  let node = nodeWith('0,0', '1,0', '2,0');
  node = { ...node, tiles: node.tiles.filter((t) => t.id !== '1,0') };
  node = setTile(node, createTile('3,0', 'new.png'));

  assert.equal(tilePosition(node, '2,0'), 1);
  assert.equal(tilePosition(node, '1,0'), undefined);
  assert.equal(tileAtXY(node, 3, 0).imageRef, 'new.png');
});

test('withTileReplaced and withTilesReplaced write only the given positions', () => {
  const node = nodeWith('0,0', '1,0', '2,0');
  const one = withTileReplaced(node, 1, createTile('1,0', 'one.png'));
  assert.equal(tileAt(one, '1,0')?.imageRef, 'one.png');
  assert.equal(tileAt(one, '0,0')?.imageRef, 'grass.png');

  const many = withTilesReplaced(
    node,
    new Map([
      [0, createTile('0,0', 'a.png')],
      [2, createTile('2,0', 'c.png')],
    ]),
  );
  assert.equal(tileAtXY(many, 0, 0).imageRef, 'a.png');
  assert.equal(tileAtXY(many, 1, 0).imageRef, 'grass.png');
  assert.equal(tileAtXY(many, 2, 0).imageRef, 'c.png');
});

test('withTileAppended puts the tile last', () => {
  const node = withTileAppended(nodeWith('0,0'), createTile('5,5', 'far.png'));
  assert.equal(node.tiles.length, 2);
  assert.equal(node.tiles[1].id, '5,5');
  assert.equal(tileAtXY(node, 5, 5).imageRef, 'far.png');
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
