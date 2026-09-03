import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pushEdit, popEdit, nodeSnapshot, DEFAULT_EDIT_LIMIT } from '../src/map/EditHistory.js';
import { createMapNode } from '../src/map/TileGrid.js';

test('pushEdit appends and popEdit restores in LIFO order', () => {
  const a = createMapNode('a', 'A', null, 4, 4);
  const b = createMapNode('b', 'B', null, 4, 4);
  let history = pushEdit([], nodeSnapshot([a]));
  history = pushEdit(history, nodeSnapshot([b]));

  const first = popEdit(history);
  assert.deepEqual(first.snapshot?.nodes, [b]);
  const second = popEdit(first.history);
  assert.deepEqual(second.snapshot?.nodes, [a]);
  assert.equal(second.history.length, 0);
});

test('popEdit on an empty ring reports nothing to undo', () => {
  const { history, snapshot } = popEdit([]);
  assert.equal(snapshot, null);
  assert.deepEqual(history, []);
});

test('pushEdit drops the oldest entry past the limit', () => {
  const nodes = [...Array(5)].map((_, i) => createMapNode(`n${i}`, `N${i}`, null, 2, 2));
  /** @type {import('../src/map/EditHistory.js').EditSnapshot[]} */
  let history = [];
  for (const node of nodes) history = pushEdit(history, nodeSnapshot([node]), 3);
  assert.equal(history.length, 3);
  assert.deepEqual(
    history.map((s) => s.nodes[0].id),
    ['n2', 'n3', 'n4'],
  );
});

test('a node snapshot records the nodes alone and nothing created, removed, or moved', () => {
  const parent = createMapNode('p', 'Parent', null, 8, 8);
  const child = createMapNode('c', 'Child', 'p', 4, 4);
  const { snapshot } = popEdit(pushEdit([], nodeSnapshot([child, parent])));
  assert.deepEqual(
    snapshot?.nodes.map((n) => n.id),
    ['c', 'p'],
  );
  assert.deepEqual(snapshot?.created, []);
  assert.deepEqual(snapshot?.removed, []);
  assert.equal(snapshot?.party, null);
  assert.deepEqual(snapshot?.recalled, []);
});

test('the default limit holds a painting session of thirty strokes', () => {
  assert.equal(DEFAULT_EDIT_LIMIT, 30);
});
