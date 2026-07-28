import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMapNode, createTile, getTile, setTile } from '../src/map/TileGrid.js';
import {
  findRegionGroups,
  isFilledRect,
  groupImageRef,
  groupImageChunks,
} from '../src/map/RegionGroups.js';
import { fillTiles } from './helpers/grid.js';

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

test('cells carry the member coordinates in tileIds order', () => {
  const node = nodeFromLayout(
    [
      ['R', 'R', 'R'],
      ['R', '.', '.'],
      ['R', '.', '.'],
    ],
    (cell) => (cell === 'R' ? 'region' : null),
  );

  const group = findRegionGroups(node)[0];
  assert.equal(group.cells.length, group.tileIds.length);
  assert.deepEqual(
    group.cells.map((c) => `${c.x},${c.y}`),
    group.tileIds,
    'the renderer indexes cells by a tile id position, so the two stay aligned',
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

test('groupImageRef tie-breaks two tiles on the same row by the smaller x', () => {
  let node = createMapNode('n', 'Node', null, 2, 1);
  node = setTile(node, createTile('0,0', 'left.svg', { childNodeId: 'region' }));
  node = setTile(node, createTile('1,0', 'right.svg', { childNodeId: 'region' }));
  // Feed the ids right-first so the reduce meets the same-row/smaller-x case.
  assert.equal(groupImageRef(node, { tileIds: ['1,0', '0,0'] }), 'left.svg');
});

test('groupImageChunks splits a 4x4 block into four 2x2 chunks with their own images', () => {
  const node = fillTiles(createMapNode('n', 'Node', null, 4, 4), (id) =>
    createTile(id, `forest-${id}.svg`, { childNodeId: 'region' }),
  );
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
  const node = fillTiles(createMapNode('n', 'Node', null, 3, 3), (id) =>
    createTile(id, 'forest.svg', { childNodeId: 'region' }),
  );
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

test('findRegionGroups and groupImageChunks are memoized per node', () => {
  const node = nodeFromLayout(
    [
      ['R', 'R'],
      ['R', 'R'],
    ],
    (cell) => (cell === 'R' ? 'region' : null),
  );
  const groups = findRegionGroups(node);
  assert.equal(findRegionGroups(node), groups, 'same node yields the cached group array');
  const chunks = groupImageChunks(node, groups[0]);
  assert.equal(groupImageChunks(node, groups[0]), chunks, 'same group yields cached chunks');
});

test('chunks survive a node object replaced without a tile change', () => {
  const node = nodeFromLayout(
    [
      ['R', 'R'],
      ['R', 'R'],
    ],
    (cell) => (cell === 'R' ? 'region' : null),
  );
  const group = findRegionGroups(node)[0];
  const chunks = groupImageChunks(node, group);
  // What a mid-stroke swap looks like from here: a fresh node object carrying
  // the same group, which the previous (node, group) key could never hit on.
  assert.equal(groupImageChunks({ ...node }, group), chunks);
});

test('chunks rebuild when a member tile is repainted', () => {
  let node = nodeFromLayout(
    [
      ['R', 'R'],
      ['R', 'R'],
    ],
    (cell) => (cell === 'R' ? 'region' : null),
  );
  const group = findRegionGroups(node)[0];
  assert.equal(groupImageChunks(node, group)[0].imageRef, 'grass.svg');
  node = setTile(node, createTile('0,0', 'water.svg', { childNodeId: 'region' }));
  const rebuilt = groupImageChunks(node, group);
  assert.equal(rebuilt[0].imageRef, 'water.svg', 'the repainted top-left tile wins');
  // And the rebuilt chunks are then themselves cached against the new list.
  assert.equal(groupImageChunks(node, group), rebuilt);
});

test('a group reports its tiles under their own ids, not re-formatted ones', () => {
  // "01,2" parses as (1, 2) but isn't how the id would be written, so a group
  // keyed by coordinates would list a member the renderer can never look up.
  let node = createMapNode('n', 'Node', null, 4, 4);
  node = setTile(node, createTile('01,2', 'grass.svg', { childNodeId: 'region' }));

  const groups = findRegionGroups(node);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].tileIds, ['01,2']);
  assert.equal(getTile(node, groups[0].tileIds[0])?.childNodeId, 'region');
});
