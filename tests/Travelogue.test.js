import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEntry, appendEntry, TRAVELOG_LIMIT } from '../src/log/Travelogue.js';

test('createEntry builds an entry with the given fields', () => {
  const entry = createEntry('e1', 'travel', 'Entered the Keep.', 1000);
  assert.deepEqual(entry, { id: 'e1', kind: 'travel', message: 'Entered the Keep.', at: 1000 });
});

test('appendEntry adds to the end, keeping oldest-first order', () => {
  let log = [];
  log = appendEntry(log, createEntry('e1', 'travel', 'A', 1));
  log = appendEntry(log, createEntry('e2', 'combat', 'B', 2));
  assert.deepEqual(log.map((e) => e.id), ['e1', 'e2']);
});

test('appendEntry does not mutate the input list', () => {
  const log = [createEntry('e1', 'travel', 'A', 1)];
  const next = appendEntry(log, createEntry('e2', 'travel', 'B', 2));
  assert.equal(log.length, 1);
  assert.equal(next.length, 2);
});

test('appendEntry trims the oldest entries once past the limit', () => {
  let log = [];
  for (let i = 0; i < TRAVELOG_LIMIT + 5; i++) {
    log = appendEntry(log, createEntry(`e${i}`, 'travel', `m${i}`, i));
  }
  assert.equal(log.length, TRAVELOG_LIMIT);
  // The five oldest (e0..e4) were dropped; the newest is retained.
  assert.equal(log[0].id, 'e5');
  assert.equal(log[log.length - 1].id, `e${TRAVELOG_LIMIT + 4}`);
});

test('appendEntry honors a custom limit', () => {
  let log = [];
  for (let i = 0; i < 4; i++) log = appendEntry(log, createEntry(`e${i}`, 'note', 'x', i), 2);
  assert.deepEqual(log.map((e) => e.id), ['e2', 'e3']);
});
