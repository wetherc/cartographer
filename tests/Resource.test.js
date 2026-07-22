import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createResource, spend, restore, setMax, isEmpty } from '../src/entities/Resource.js';

test('createResource starts at full capacity', () => {
  const mana = createResource('r1', 'Mana', 'mana', 10);
  assert.equal(mana.current, 10);
  assert.equal(mana.max, 10);
  assert.equal(mana.type, 'mana');
});

test('spend reduces current without mutating the original', () => {
  const mana = createResource('r1', 'Mana', 'mana', 10);
  const after = spend(mana, 4);
  assert.equal(after.current, 6);
  assert.equal(mana.current, 10);
});

test('spend clamps at 0', () => {
  const mana = createResource('r1', 'Mana', 'mana', 10);
  assert.equal(spend(mana, 100).current, 0);
});

test('restore clamps at max', () => {
  const mana = spend(createResource('r1', 'Mana', 'mana', 10), 8);
  assert.equal(restore(mana, 100).current, 10);
});

test('setMax raises capacity without changing current', () => {
  const arrows = createResource('r1', 'Arrows', 'item-count', 20);
  const spent = spend(arrows, 15); // current 5
  const raised = setMax(spent, 30);
  assert.equal(raised.max, 30);
  assert.equal(raised.current, 5);
});

test('setMax clamps current down if it now exceeds the new max', () => {
  const arrows = createResource('r1', 'Arrows', 'item-count', 20);
  const lowered = setMax(arrows, 5);
  assert.equal(lowered.max, 5);
  assert.equal(lowered.current, 5);
});

test('isEmpty reflects current <= 0', () => {
  const arrows = createResource('r1', 'Arrows', 'item-count', 3);
  assert.equal(isEmpty(arrows), false);
  assert.equal(isEmpty(spend(arrows, 3)), true);
});
