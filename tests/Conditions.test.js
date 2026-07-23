import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createCondition,
  addCondition,
  removeCondition,
  tickConditions,
} from '../src/entities/Conditions.js';

test('addCondition appends a new condition', () => {
  const list = addCondition([], 'Poisoned');
  assert.deepEqual(list, [createCondition('Poisoned', null)]);
});

test('addCondition replaces a same-name condition case-insensitively rather than stacking', () => {
  const list = addCondition(addCondition([], 'Poisoned', 2), 'poisoned', 5);
  assert.equal(list.length, 1);
  assert.equal(list[0].name, 'poisoned');
  assert.equal(list[0].rounds, 5);
});

test('addCondition trims and ignores an empty name', () => {
  assert.deepEqual(addCondition([], '   '), []);
  assert.equal(addCondition([], '  Prone  ')[0].name, 'Prone');
});

test('removeCondition drops by name case-insensitively', () => {
  const list = addCondition(addCondition([], 'Prone'), 'Stunned');
  assert.deepEqual(
    removeCondition(list, 'prone').map((c) => c.name),
    ['Stunned'],
  );
});

test('tickConditions decrements timed conditions and drops the expired', () => {
  const list = [createCondition('Frightened', 2), createCondition('Poisoned', 1), createCondition('Prone', null)];
  const next = tickConditions(list);
  assert.deepEqual(next, [createCondition('Frightened', 1), createCondition('Prone', null)]);
});

test('tickConditions leaves indefinite conditions untouched', () => {
  const list = [createCondition('Charmed', null)];
  assert.deepEqual(tickConditions(list), list);
});
