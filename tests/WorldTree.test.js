import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorldTree, collectSubtreeIds } from '../src/map/WorldTree.js';
import { TileGrid, createMapNode, createTile, setTile } from '../src/map/TileGrid.js';

/** @param {string} id @param {string|null} parentId */
function node(id, parentId) {
  return createMapNode(id, id, parentId, 1, 1);
}

test('buildWorldTree nests children under parents with depth', () => {
  const tree = buildWorldTree([
    node('world', null),
    node('region', 'world'),
    node('sub', 'region'),
  ]);
  assert.equal(tree.length, 1);
  assert.equal(tree[0].node.id, 'world');
  assert.equal(tree[0].depth, 0);
  assert.equal(tree[0].children[0].node.id, 'region');
  assert.equal(tree[0].children[0].depth, 1);
  assert.equal(tree[0].children[0].children[0].node.id, 'sub');
  assert.equal(tree[0].children[0].children[0].depth, 2);
});

test('buildWorldTree treats an orphan (missing parent) as a root', () => {
  const tree = buildWorldTree([node('a', 'ghost'), node('b', null)]);
  assert.deepEqual(
    tree.map((t) => t.node.id).sort(),
    ['a', 'b'],
  );
});

test('buildWorldTree preserves child input order', () => {
  const tree = buildWorldTree([
    node('world', null),
    node('c2', 'world'),
    node('c1', 'world'),
  ]);
  assert.deepEqual(
    tree[0].children.map((c) => c.node.id),
    ['c2', 'c1'],
  );
});

test('buildWorldTree does not loop on a cyclic parentId chain', () => {
  const tree = buildWorldTree([node('a', 'b'), node('b', 'a')]);
  // Both point at each other, neither is a true root; whichever is visited
  // first anchors the tree and the other becomes its child, once each.
  const ids = [];
  /** @param {import('../src/map/WorldTree.js').WorldTreeNode} n */
  function walk(n) {
    ids.push(n.node.id);
    n.children.forEach(walk);
  }
  tree.forEach(walk);
  assert.deepEqual(ids.sort(), ['a', 'b']);
});

test('collectSubtreeIds includes the root and every descendant', () => {
  const nodes = [
    node('world', null),
    node('region', 'world'),
    node('sub', 'region'),
    node('other', 'world'),
  ];
  assert.deepEqual(
    [...collectSubtreeIds(nodes, 'region')].sort(),
    ['region', 'sub'],
  );
  assert.deepEqual(
    [...collectSubtreeIds(nodes, 'world')].sort(),
    ['other', 'region', 'sub', 'world'],
  );
});

test('TileGrid.removeNode deletes the subtree and clears dangling child links', () => {
  const grid = new TileGrid();
  let world = createMapNode('world', 'World', null, 2, 1);
  world = setTile(world, createTile('0,0', 'grass', { childNodeId: 'region' }));
  world = setTile(world, createTile('1,0', 'grass'));
  grid.addNode(world);
  grid.addNode(createMapNode('region', 'Region', 'world', 1, 1));
  grid.addNode(createMapNode('sub', 'Sub', 'region', 1, 1));

  const removed = grid.removeNode('region');

  assert.deepEqual([...removed].sort(), ['region', 'sub']);
  assert.equal(grid.getNode('region'), undefined);
  assert.equal(grid.getNode('sub'), undefined);
  assert.equal(grid.getNode('world').tiles.find((t) => t.id === '0,0').childNodeId, null);
});
