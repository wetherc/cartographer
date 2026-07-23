import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createHandout,
  withDefaults,
  toggleRevealed,
  handoutsAt,
} from '../src/handout/Handouts.js';

test('createHandout defaults to hidden, empty body, campaign-wide', () => {
  const h = createHandout('h1', 'The Prophecy');
  assert.deepEqual(h, { id: 'h1', title: 'The Prophecy', body: '', nodeId: null, revealed: false });
});

test('createHandout keeps supplied body/nodeId/revealed', () => {
  const h = createHandout('h1', 'Note', 'read aloud', 'world', true);
  assert.equal(h.body, 'read aloud');
  assert.equal(h.nodeId, 'world');
  assert.equal(h.revealed, true);
});

test('withDefaults backfills a legacy handout missing fields', () => {
  const filled = withDefaults({ id: 'h1', title: 'Old' });
  assert.deepEqual(filled, { id: 'h1', title: 'Old', body: '', nodeId: null, revealed: false });
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
