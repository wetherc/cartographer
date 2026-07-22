import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMapNode, createTile, setTile } from '../src/map/TileGrid.js';
import { findRegionGroups } from '../src/map/RegionGroups.js';

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
