import test from 'node:test';
import assert from 'node:assert/strict';
import { changedTileIds, dirtyCells, merge } from '../src/map/TerrainDirty.js';
import { createMapNode, createTile, setTile } from '../src/map/TileGrid.js';

/** A node of `w` x `h` grass tiles. */
function grass(w = 10, h = 10, overrides = {}) {
  let node = createMapNode('n', 'N', null, w, h);
  const tiles = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) tiles.push(createTile(`${x},${y}`, 'grass', overrides));
  }
  node = { ...node, tiles };
  return node;
}

/** @param {any} node @param {string} id */
const reveal = (node, id) =>
  setTile(node, { ...node.tiles.find((t) => t.id === id), revealed: true });

/** A terrain key; see terrainKey in TerrainLayer.js. */
function key(overrides = {}) {
  return /** @type {any} */ ({
    node: NODE,
    regionGroups: GROUPS,
    revealAll: false,
    fogDim: false,
    markerRange: 2,
    partyTileId: null,
    partyInNode: true,
    tokens: '',
    ...overrides,
  });
}
const NODE = grass();
const GROUPS = /** @type {any[]} */ ([]);

/** @param {number} minX @param {number} minY @param {number} maxX @param {number} maxY */
const c = (minX, minY, maxX, maxY) => ({ minX, minY, maxX, maxY });

test('an unchanged key has no dirty cells', () => {
  assert.deepEqual(dirtyCells(key(), key()), []);
});

test('a changed tile dirties its cell and the cells beside it', () => {
  assert.deepEqual(dirtyCells(key(), key({ node: reveal(NODE, '5,5') })), [c(4, 4, 6, 6)]);
  // The rect stops at the map edge.
  assert.deepEqual(dirtyCells(key(), key({ node: reveal(NODE, '0,0') })), [c(0, 0, 1, 1)]);
});

test('changed tiles next to each other paint as one rect', () => {
  const node = reveal(reveal(NODE, '5,5'), '6,5');
  assert.deepEqual(dirtyCells(key(), key({ node })), [c(4, 4, 7, 6)]);
});

test('a dirty cell grows to the whole of a span block it touches', () => {
  const big = setTile(NODE, createTile('2,2', 'tower', { span: 3 }));
  const before = key({ node: big });
  assert.deepEqual(dirtyCells(before, key({ node: reveal(big, '3,3') })), [c(2, 2, 4, 4)]);
  assert.deepEqual(dirtyCells(before, key({ node: reveal(big, '5,5') })), [c(2, 2, 6, 6)]);
  // A new span block counts too: it lists in the new node only.
  assert.deepEqual(dirtyCells(key(), before), [c(1, 1, 4, 4)]);
});

test('a dirty cell grows to the whole of a region group it touches', () => {
  const group = { minX: 7, minY: 7, maxX: 9, maxY: 9, tileIds: [] };
  const groups = [group];
  const node = reveal(NODE, '6,6');
  assert.deepEqual(dirtyCells(key({ regionGroups: groups }), key({ node, regionGroups: groups })), [
    c(5, 5, 9, 9),
  ]);
});

test('growing into one box can reach the next box', () => {
  const groups = [
    { minX: 2, minY: 0, maxX: 5, maxY: 0, tileIds: [] },
    { minX: 5, minY: 2, maxX: 8, maxY: 3, tileIds: [] },
  ];
  const node = reveal(NODE, '1,1');
  // 0..2 touches the first group (to x 5), which then touches the second.
  assert.deepEqual(dirtyCells(key({ regionGroups: groups }), key({ node, regionGroups: groups })), [
    c(0, 0, 8, 3),
  ]);
});

test('a moved anchor dirties the marker range around its old and new tile', () => {
  const a = key({ partyTileId: '1,1' });
  const b = key({ partyTileId: '2,1' });
  // Range 2 plus one cell of slack: 3 cells around each tile.
  assert.deepEqual(dirtyCells(a, b), [c(0, 0, 5, 4)]);
  assert.deepEqual(dirtyCells(key({ tokens: '1,1' }), key({ tokens: '1,1 8,8' })), [c(5, 5, 9, 9)]);
  // A party outside the node anchors nothing.
  assert.deepEqual(
    dirtyCells(
      key({ partyTileId: '1,1', partyInNode: false }),
      key({ partyTileId: '2,1', partyInNode: false }),
    ),
    [],
  );
});

test('a tile added or removed counts as changed', () => {
  const small = { ...NODE, tiles: NODE.tiles.slice(0, 99) };
  /** @type {string[]} */
  const ids = [];
  changedTileIds(small, NODE, (id) => ids.push(id));
  assert.deepEqual(ids, ['9,9']);
  ids.length = 0;
  changedTileIds(NODE, small, (id) => ids.push(id));
  assert.deepEqual(ids, ['9,9']);
});

test('many scattered changes paint as one rect around them all', () => {
  let node = grass(100, 100);
  const before = key({ node });
  for (let i = 0; i < 30; i++) node = reveal(node, `${i * 3},${(i % 2) * 50}`);
  assert.deepEqual(dirtyCells(before, key({ node })), [c(0, 0, 88, 51)]);
});

test('anything other than tiles and anchors repaints everything', () => {
  const base = key();
  assert.equal(dirtyCells(base, key({ revealAll: true })), null);
  assert.equal(dirtyCells(base, key({ fogDim: true })), null);
  assert.equal(dirtyCells(base, key({ markerRange: 3 })), null);
  assert.equal(dirtyCells(base, key({ node: null })), null);
  assert.equal(dirtyCells(base, key({ regionGroups: [] })), null);
  assert.equal(dirtyCells(base, key({ node: { ...NODE, id: 'm' } })), null);
  assert.equal(dirtyCells(base, key({ node: { ...NODE, kind: 'interior' } })), null);
  assert.equal(dirtyCells(base, key({ node: { ...NODE, width: 11 } })), null);
  assert.equal(dirtyCells(base, key({ node: { ...NODE, height: 11 } })), null);
  const blank = grass(10, 10, { imageRef: null });
  assert.equal(
    dirtyCells(key({ node: blank }), key({ node: setTile(blank, NODE.tiles[0]) })),
    null,
  );
  // A load that replaces every tile object.
  const copied = { ...NODE, tiles: NODE.tiles.map((t) => ({ ...t })) };
  assert.equal(dirtyCells(base, key({ node: copied })), null);
});

test('merge joins rects until no two overlap', () => {
  assert.deepEqual(merge([c(0, 0, 1, 1), c(5, 5, 6, 6), c(1, 1, 5, 5)]), [c(0, 0, 6, 6)]);
  assert.deepEqual(merge([c(0, 0, 1, 1), c(3, 3, 4, 4)]), [c(0, 0, 1, 1), c(3, 3, 4, 4)]);
});
