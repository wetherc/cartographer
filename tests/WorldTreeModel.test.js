import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ancestorIds,
  buildWorldTree,
  collectSubtreeIds,
  filterWorldTree,
  matchesQuery,
} from '../src/map/WorldTreeModel.js';
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
  assert.deepEqual(tree.map((t) => t.node.id).sort(), ['a', 'b']);
});

test('buildWorldTree preserves child input order', () => {
  const tree = buildWorldTree([node('world', null), node('c2', 'world'), node('c1', 'world')]);
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
  /** @param {import('../src/map/WorldTreeModel.js').WorldTreeNode} n */
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
  assert.deepEqual([...collectSubtreeIds(nodes, 'region')].sort(), ['region', 'sub']);
  assert.deepEqual([...collectSubtreeIds(nodes, 'world')].sort(), [
    'other',
    'region',
    'sub',
    'world',
  ]);
});

test('collectSubtreeIds is safe against a parentId cycle', () => {
  // a<->b point at each other; the traversal must visit each once and stop.
  assert.deepEqual([...collectSubtreeIds([node('a', 'b'), node('b', 'a')], 'a')].sort(), [
    'a',
    'b',
  ]);
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

test('ancestorIds lists the parents of a node, nearest first', () => {
  const nodes = [node('world', null), node('region', 'world'), node('sub', 'region')];
  assert.deepEqual(ancestorIds(nodes, 'sub'), ['region', 'world']);
  assert.deepEqual(ancestorIds(nodes, 'world'), []);
});

test('ancestorIds returns nothing for an unknown node and stops at a missing parent', () => {
  assert.deepEqual(ancestorIds([node('a', null)], 'ghost'), []);
  assert.deepEqual(ancestorIds([node('a', 'ghost'), node('b', 'a')], 'b'), ['a']);
});

test('ancestorIds stops on a parentId cycle', () => {
  const nodes = [node('a', 'b'), node('b', 'c'), node('c', 'a')];
  assert.deepEqual(ancestorIds(nodes, 'a'), ['b', 'c']);
});

/** @param {import('../src/map/WorldTreeModel.js').WorldTreeNode[]} roots @returns {unknown[]} */
function outline(roots) {
  return roots.map((r) => [r.node.name, outline(r.children)]);
}

test('filterWorldTree keeps each match with the path that leads to it', () => {
  const tree = buildWorldTree([
    createMapNode('w', 'World', null, 1, 1),
    createMapNode('r1', 'North Vale', 'w', 1, 1),
    createMapNode('t1', 'Temple', 'r1', 1, 1),
    createMapNode('c1', 'Temple cellar', 't1', 1, 1),
    createMapNode('r2', 'South Moor', 'w', 1, 1),
  ]);
  assert.deepEqual(outline(filterWorldTree(tree, '  TEMPLE ')), [
    ['World', [['North Vale', [['Temple', [['Temple cellar', []]]]]]]],
  ]);
  assert.deepEqual(outline(filterWorldTree(tree, 'vale')), [['World', [['North Vale', []]]]]);
  assert.deepEqual(filterWorldTree(tree, 'nowhere'), []);
});

test('filterWorldTree returns the same tree for a blank query', () => {
  const tree = buildWorldTree([node('world', null)]);
  assert.equal(filterWorldTree(tree, '   '), tree);
});

test('matchesQuery ignores case and spaces, and an empty query matches nothing', () => {
  const temple = createMapNode('t', 'Temple', null, 1, 1);
  assert.equal(matchesQuery(temple, '  tEMp '), true);
  assert.equal(matchesQuery(temple, 'inn'), false);
  assert.equal(matchesQuery(temple, '   '), false);
});
