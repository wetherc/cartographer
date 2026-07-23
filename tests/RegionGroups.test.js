import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMapNode, createTile, setTile } from '../src/map/TileGrid.js';
import { findRegionGroups, isFilledRect, groupImageRef, groupImageChunks } from '../src/map/RegionGroups.js';

function nodeFromLayout(rows, childNodeIdFor) {
  let node = createMapNode('n', 'Node', null, rows[0].length, rows.length);
  rows.forEach((row, y) => {
    row.forEach((cell, x) => {
      const childNodeId = childNodeIdFor(cell);
      node = setTile(node, createTile(`${x},${y}`, 'grass.svg', { childNodeId }));
    });
  });
  return node;
}

test('groups a contiguous 2x2 block sharing one childNodeId', () => {
  const node = nodeFromLayout(
    [
      ['R', 'R', '.'],
      ['R', 'R', '.'],
      ['.', '.', '.'],
    ],
    (cell) => (cell === 'R' ? 'region' : null),
  );

  const groups = findRegionGroups(node);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].childNodeId, 'region');
  assert.equal(groups[0].tileIds.length, 4);
  assert.deepEqual(
    { minX: groups[0].minX, minY: groups[0].minY, maxX: groups[0].maxX, maxY: groups[0].maxY },
    { minX: 0, minY: 0, maxX: 1, maxY: 1 },
  );
});

test('diagonal-only tiles are not contiguous (4-neighbor adjacency only)', () => {
  const node = nodeFromLayout(
    [
      ['R', '.'],
      ['.', 'R'],
    ],
    (cell) => (cell === 'R' ? 'region' : null),
  );

  const groups = findRegionGroups(node);
  assert.equal(groups.length, 2);
});

test('tiles with different childNodeId values form separate groups even if adjacent', () => {
  const node = nodeFromLayout([['A', 'B']], (cell) => (cell === 'A' ? 'region-a' : 'region-b'));

  const groups = findRegionGroups(node);
  assert.equal(groups.length, 2);
  const ids = groups.map((g) => g.childNodeId).sort();
  assert.deepEqual(ids, ['region-a', 'region-b']);
});

test('tiles with no childNodeId are ignored', () => {
  const node = nodeFromLayout([['.', '.']], () => null);
  assert.deepEqual(findRegionGroups(node), []);
});

test('non-coordinate tile ids are ignored', () => {
  let node = createMapNode('n', 'Node', null, 1, 1);
  node = setTile(node, createTile('poi', 'grass.svg', { childNodeId: 'region' }));
  assert.deepEqual(findRegionGroups(node), []);
});

test('isFilledRect distinguishes a full block from a ragged group', () => {
  const full = nodeFromLayout(
    [
      ['R', 'R'],
      ['R', 'R'],
    ],
    (cell) => (cell === 'R' ? 'region' : null),
  );
  assert.equal(isFilledRect(findRegionGroups(full)[0]), true);

  const ragged = nodeFromLayout(
    [
      ['R', 'R'],
      ['R', '.'],
    ],
    (cell) => (cell === 'R' ? 'region' : null),
  );
  assert.equal(isFilledRect(findRegionGroups(ragged)[0]), false);
});

test('groupImageRef prefers a POI-marked tile, else the top-left-most image', () => {
  let node = createMapNode('n', 'Node', null, 2, 2);
  node = setTile(node, createTile('0,0', 'forest-1.svg', { childNodeId: 'region' }));
  node = setTile(node, createTile('1,0', 'forest-2.svg', { childNodeId: 'region' }));
  node = setTile(node, createTile('0,1', 'forest-3.svg', { childNodeId: 'region' }));
  node = setTile(node, createTile('1,1', 'forest-4.svg', { childNodeId: 'region' }));
  const group = findRegionGroups(node)[0];
  assert.equal(groupImageRef(node, group), 'forest-1.svg');

  const marked = setTile(node, {
    ...node.tiles.find((t) => t.id === '1,1'),
    imageRef: 'village.svg',
    metadata: { poiType: 'settlement', discoverable: false, discovered: false, notes: '' },
  });
  assert.equal(groupImageRef(marked, group), 'village.svg');
});

test('groupImageChunks splits a 4x4 block into four 2x2 chunks with their own images', () => {
  let node = createMapNode('n', 'Node', null, 4, 4);
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      node = setTile(node, createTile(`${x},${y}`, `forest-${x},${y}.svg`, { childNodeId: 'region' }));
    }
  }
  const chunks = groupImageChunks(node, findRegionGroups(node)[0]);
  assert.equal(chunks.length, 4);
  assert.deepEqual(
    chunks.map((c) => ({ minX: c.minX, minY: c.minY, maxX: c.maxX, maxY: c.maxY })),
    [
      { minX: 0, minY: 0, maxX: 1, maxY: 1 },
      { minX: 2, minY: 0, maxX: 3, maxY: 1 },
      { minX: 0, minY: 2, maxX: 1, maxY: 3 },
      { minX: 2, minY: 2, maxX: 3, maxY: 3 },
    ],
  );
  assert.deepEqual(
    chunks.map((c) => c.imageRef),
    ['forest-0,0.svg', 'forest-2,0.svg', 'forest-0,2.svg', 'forest-2,2.svg'],
    'each chunk uses its own top-left tile image',
  );
  assert.equal(chunks[0].tileIds.length, 4);
});

test('groupImageChunks leaves 1-wide strips on odd-sized blocks', () => {
  let node = createMapNode('n', 'Node', null, 3, 3);
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) {
      node = setTile(node, createTile(`${x},${y}`, 'forest.svg', { childNodeId: 'region' }));
    }
  }
  const chunks = groupImageChunks(node, findRegionGroups(node)[0]);
  assert.deepEqual(
    chunks.map((c) => ({ minX: c.minX, minY: c.minY, maxX: c.maxX, maxY: c.maxY })),
    [
      { minX: 0, minY: 0, maxX: 1, maxY: 1 },
      { minX: 2, minY: 0, maxX: 2, maxY: 1 },
      { minX: 0, minY: 2, maxX: 1, maxY: 2 },
      { minX: 2, minY: 2, maxX: 2, maxY: 2 },
    ],
  );
});

test('groupImageChunks returns nothing for a ragged group', () => {
  const node = nodeFromLayout(
    [
      ['R', 'R'],
      ['R', '.'],
    ],
    (cell) => (cell === 'R' ? 'region' : null),
  );
  assert.deepEqual(groupImageChunks(node, findRegionGroups(node)[0]), []);
});

test('groupImageRef returns null when no member tile carries an image', () => {
  let node = createMapNode('n', 'Node', null, 2, 1);
  node = setTile(node, createTile('0,0', '', { childNodeId: 'region' }));
  node = setTile(node, createTile('1,0', '', { childNodeId: 'region' }));
  const group = findRegionGroups(node)[0];
  assert.equal(groupImageRef(node, group), null);
});
