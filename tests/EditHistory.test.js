import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pushEdit,
  popEdit,
  nodeSnapshot,
  commitEdit,
  addHandoutBindings,
  liveEdits,
  samePosition,
  DEFAULT_EDIT_LIMIT,
} from '../src/map/EditHistory.js';
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
  assert.deepEqual(snapshot?.creatures, []);
  assert.equal(snapshot?.entryTiles, null, 'a stroke leaves the entry memory alone');
});

test('the default limit holds a painting session of thirty strokes', () => {
  assert.equal(DEFAULT_EDIT_LIMIT, 30);
});

test('commitEdit records the nodes as the last edit left them, once', () => {
  const a = createMapNode('a', 'A', null, 4, 4);
  const a2 = { ...a, name: 'A2' };
  const history = pushEdit([], nodeSnapshot([a]));
  const committed = commitEdit(history, () => a2);
  assert.deepEqual(committed[0].after, [a2]);
  assert.equal(history[0].after, null, 'the input ring is unchanged');
  assert.equal(
    commitEdit(committed, () => a),
    committed,
    'a second commit changes nothing',
  );
  assert.deepEqual(
    commitEdit([], () => a),
    [],
  );
});

test('commitEdit keeps the before state of a node that no longer exists', () => {
  const a = createMapNode('a', 'A', null, 4, 4);
  const committed = commitEdit(pushEdit([], nodeSnapshot([a])), () => undefined);
  assert.deepEqual(committed[0].after, [a]);
});

test('addHandoutBindings adds to the most recent edit only', () => {
  const a = nodeSnapshot([createMapNode('a', 'A', null, 2, 2)]);
  const b = nodeSnapshot([createMapNode('b', 'B', null, 2, 2)]);
  const binding = { handoutId: 'note', nodeId: 'b', tileId: '1,1' };
  const history = addHandoutBindings([a, b], [binding]);
  assert.equal(history[0], a);
  assert.deepEqual(history[1].handouts, [binding]);
  assert.deepEqual(b.handouts, [], 'the recorded snapshot stays as it was');
});

test('addHandoutBindings keeps the ring when there is nothing to add or no edit', () => {
  const ring = [nodeSnapshot([createMapNode('a', 'A', null, 2, 2)])];
  assert.equal(addHandoutBindings(ring, []), ring);
  /** @type {import('../src/map/EditHistory.js').EditSnapshot[]} */
  const empty = [];
  assert.equal(addHandoutBindings(empty, [{ handoutId: 'x', nodeId: 'a', tileId: '0,0' }]), empty);
});

test('nodeSnapshot names the edit for the Undo button', () => {
  const a = createMapNode('a', 'A', null, 2, 2);
  assert.equal(nodeSnapshot([a]).label, 'map edit');
  assert.equal(nodeSnapshot([a], 'paint stroke').label, 'paint stroke');
});

test('commitEdit records where an edit left the party, and drops a party that did not move', () => {
  const a = createMapNode('a', 'A', null, 2, 2);
  const withParty = { ...nodeSnapshot([a]), party: { nodeId: 'a', tileId: '0,0' } };
  const moved = commitEdit([withParty], () => a, { nodeId: 'a', tileId: '1,1' })[0];
  assert.deepEqual(moved.party, { nodeId: 'a', tileId: '0,0' });
  assert.deepEqual(moved.partyAfter, { nodeId: 'a', tileId: '1,1' });
  const still = commitEdit([withParty], () => a, { nodeId: 'a', tileId: '0,0' })[0];
  assert.equal(still.party, null);
  assert.equal(still.partyAfter, null);
  // An edit that never recorded the party keeps no party.
  const plain = commitEdit([nodeSnapshot([a])], () => a, { nodeId: 'a', tileId: '1,1' })[0];
  assert.equal(plain.party, null);
  assert.equal(plain.partyAfter, undefined);
});

test('samePosition compares node and tile', () => {
  assert.equal(samePosition({ nodeId: 'a', tileId: '0,0' }, { nodeId: 'a', tileId: '0,0' }), true);
  assert.equal(samePosition({ nodeId: 'a', tileId: '0,0' }, { nodeId: 'b', tileId: '0,0' }), false);
  assert.equal(samePosition(null, { nodeId: 'a', tileId: '0,0' }), false);
});

test('liveEdits drops entries whose node is gone or whose removed map lost its parent', () => {
  const a = createMapNode('a', 'A', null, 2, 2);
  const gone = createMapNode('gone', 'Gone', 'a', 2, 2);
  const orphan = createMapNode('orphan', 'Orphan', 'deleted', 2, 2);
  const child = createMapNode('child', 'Child', 'orphan', 2, 2);
  const ok = nodeSnapshot([a]);
  const stale = nodeSnapshot([gone]);
  const orphaned = { ...nodeSnapshot([a]), removed: [orphan, child] };
  const nested = { ...nodeSnapshot([a]), removed: [gone, { ...child, parentId: 'gone' }] };
  const exists = (/** @type {string} */ id) => id === 'a';
  assert.deepEqual(liveEdits([ok, stale, orphaned, nested], exists), [ok, nested]);
  const all = [ok];
  assert.equal(liveEdits(all, exists), all, 'the same array when every entry applies');
});
