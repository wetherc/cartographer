import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createParticipant,
  sortInitiative,
  startCombat,
  currentParticipant,
  advanceTurn,
} from '../src/combat/Initiative.js';

test('sortInitiative orders highest first, ties broken by name then id', () => {
  const list = [
    createParticipant('a', 'Zed', 'foe', 12),
    createParticipant('b', 'Ana', 'party', 18),
    createParticipant('c', 'Bob', 'party', 12),
  ];
  assert.deepEqual(sortInitiative(list).map((p) => p.id), ['b', 'c', 'a']);
});

test('startCombat sorts and starts at round 1, first turn', () => {
  const state = startCombat([
    createParticipant('a', 'Goblin', 'foe', 8),
    createParticipant('b', 'Hero', 'party', 15),
  ]);
  assert.equal(state.round, 1);
  assert.equal(state.index, 0);
  assert.equal(currentParticipant(state).name, 'Hero');
});

test('advanceTurn steps through the order then wraps into the next round', () => {
  let { state } = { state: startCombat([
    createParticipant('a', 'Hero', 'party', 15),
    createParticipant('b', 'Goblin', 'foe', 8),
  ]) };
  let result = advanceTurn(state);
  assert.equal(result.wrapped, false);
  assert.equal(currentParticipant(result.state).name, 'Goblin');
  assert.equal(result.state.round, 1);

  result = advanceTurn(result.state);
  assert.equal(result.wrapped, true);
  assert.equal(result.state.round, 2);
  assert.equal(currentParticipant(result.state).name, 'Hero');
});

test('advanceTurn on an empty order is a no-op', () => {
  const state = startCombat([]);
  const result = advanceTurn(state);
  assert.equal(result.wrapped, false);
  assert.deepEqual(result.state, state);
  assert.equal(currentParticipant(state), null);
});
