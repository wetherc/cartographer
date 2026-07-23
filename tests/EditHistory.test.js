import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pushEdit, popEdit, DEFAULT_EDIT_LIMIT } from '../src/map/EditHistory.js';
import { createMapNode } from '../src/map/TileGrid.js';

test('pushEdit appends and popEdit restores in LIFO order', () => {
  const a = createMapNode('a', 'A', null, 4, 4);
  const b = createMapNode('b', 'B', null, 4, 4);
  let history = pushEdit([], [a]);
  history = pushEdit(history, [b]);

  const first = popEdit(history);
  assert.deepEqual(first.nodes, [b]);
  const second = popEdit(first.history);
  assert.deepEqual(second.nodes, [a]);
  assert.equal(second.history.length, 0);
});

test('popEdit on an empty ring reports nothing to undo', () => {
  const { history, nodes } = popEdit([]);
  assert.equal(nodes, null);
  assert.deepEqual(history, []);
});

test('pushEdit drops the oldest entry past the limit', () => {
  const nodes = [...Array(5)].map((_, i) => createMapNode(`n${i}`, `N${i}`, null, 2, 2));
  let history = [];
  for (const node of nodes) history = pushEdit(history, [node], 3);
  assert.equal(history.length, 3);
  assert.deepEqual(history.map(([n]) => n.id), ['n2', 'n3', 'n4']);
});

test('an entry can snapshot several nodes at once (e.g. node + parent on generate)', () => {
  const parent = createMapNode('p', 'Parent', null, 8, 8);
  const child = createMapNode('c', 'Child', 'p', 4, 4);
  const { nodes } = popEdit(pushEdit([], [child, parent]));
  assert.deepEqual(nodes?.map((n) => n.id), ['c', 'p']);
});

test('the default limit is generous enough for a painting session', () => {
  assert.ok(DEFAULT_EDIT_LIMIT >= 20);
});
