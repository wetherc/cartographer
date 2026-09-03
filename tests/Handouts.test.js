import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createHandout,
  withDefaults,
  toggleRevealed,
  handoutsAt,
  unbindFrom,
  bindingsIn,
  restoreBindings,
} from '../src/handout/Handouts.js';

test('createHandout defaults to hidden, empty body, campaign-wide', () => {
  const h = createHandout('h1', 'The Prophecy');
  assert.deepEqual(h, {
    id: 'h1',
    title: 'The Prophecy',
    body: '',
    nodeId: null,
    revealed: false,
    image: null,
  });
});

test('createHandout keeps supplied body/nodeId/revealed', () => {
  const h = createHandout('h1', 'Note', 'read aloud', 'world', true);
  assert.equal(h.body, 'read aloud');
  assert.equal(h.nodeId, 'world');
  assert.equal(h.revealed, true);
});

test('withDefaults backfills a legacy handout missing fields', () => {
  const filled = withDefaults({ id: 'h1', title: 'Old' });
  assert.deepEqual(filled, {
    id: 'h1',
    title: 'Old',
    body: '',
    nodeId: null,
    revealed: false,
    image: null,
  });
});

test('toggleRevealed flips the reveal flag without touching other fields', () => {
  const h = createHandout('h1', 'Note', 'body', 'world', false);
  const shown = toggleRevealed(h);
  assert.equal(shown.revealed, true);
  assert.equal(shown.title, 'Note');
  assert.equal(toggleRevealed(shown).revealed, false);
});

test('handoutsAt returns node-bound plus campaign-wide handouts, in order', () => {
  const list = [
    createHandout('a', 'A', '', 'world'),
    createHandout('b', 'B', '', 'region1'),
    createHandout('c', 'C', '', null),
  ];
  assert.deepEqual(
    handoutsAt(list, 'world').map((h) => h.id),
    ['a', 'c'],
  );
  assert.deepEqual(
    handoutsAt(list, 'region1').map((h) => h.id),
    ['b', 'c'],
  );
});

test('unbindFrom makes the handouts on the given nodes campaign-wide', () => {
  const list = [
    createHandout('a', 'A', '', 'cellar'),
    createHandout('b', 'B', '', 'world'),
    createHandout('c', 'C', '', null),
  ];
  const loose = unbindFrom(list, new Set(['cellar']));
  assert.equal(loose[0].nodeId, null);
  assert.equal(loose[1], list[1], 'a handout bound elsewhere keeps its identity');
  assert.equal(loose[2], list[2]);
});

test('unbindFrom returns the same list when no handout is bound there', () => {
  const list = [createHandout('a', 'A', '', 'world'), createHandout('c', 'C')];
  assert.equal(unbindFrom(list, new Set(['cellar'])), list);
  assert.equal(unbindFrom(list, new Set()), list);
});

test('bindingsIn records the node of each handout bound to the given nodes', () => {
  const list = [
    createHandout('a', 'A', '', 'cellar'),
    createHandout('b', 'B', '', 'world'),
    createHandout('c', 'C'),
  ];
  assert.deepEqual(bindingsIn(list, new Set(['cellar'])), [{ handoutId: 'a', nodeId: 'cellar' }]);
  assert.deepEqual(bindingsIn(list, new Set(['nowhere'])), []);
});

test('restoreBindings binds the recorded handouts back to their nodes', () => {
  const list = [createHandout('a', 'A'), createHandout('b', 'B', '', 'world')];
  const restored = restoreBindings(list, [{ handoutId: 'a', nodeId: 'cellar' }]);
  assert.equal(restored[0].nodeId, 'cellar');
  assert.equal(restored[1], list[1]);
});

test('restoreBindings skips a handout that is gone, and no bindings at all', () => {
  const list = [createHandout('a', 'A')];
  assert.equal(restoreBindings(list, []), list, 'nothing to do keeps the array');
  assert.deepEqual(restoreBindings(list, [{ handoutId: 'deleted', nodeId: 'world' }]), list);
});
