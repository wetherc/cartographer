import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createParticipant,
  sortInitiative,
  startCombat,
  currentParticipant,
  advanceTurn,
  dropParticipant,
} from '../src/combat/Initiative.js';

/**
 * A stand-in for the app's name resolution: participants carry only ids, so
 * the tie-break name comes from whatever holds them.
 * @param {Record<string, string>} names
 * @returns {(participant: { id: string }) => string}
 */
const nameOf = (names) => (participant) => names[participant.id] ?? '';

test('sortInitiative orders highest first, ties broken by name then id', () => {
  const list = [createParticipant('a', 12), createParticipant('b', 18), createParticipant('c', 12)];
  assert.deepEqual(
    sortInitiative(list, nameOf({ a: 'Zed', b: 'Ana', c: 'Bob' })).map((p) => p.id),
    ['b', 'c', 'a'],
  );
});

test('sortInitiative orders an equal-initiative pair by name in either input order', () => {
  const zed = createParticipant('z', 12);
  const ana = createParticipant('a', 12);
  const names = nameOf({ z: 'Zed', a: 'Ana' });
  // Both input orders sort by name — exercising the comparator both directions.
  assert.deepEqual(
    sortInitiative([zed, ana], names).map((p) => p.id),
    ['a', 'z'],
  );
  assert.deepEqual(
    sortInitiative([ana, zed], names).map((p) => p.id),
    ['a', 'z'],
  );
});

test('sortInitiative breaks a same-name, same-initiative tie by id', () => {
  const list = [createParticipant('z', 10), createParticipant('a', 10)];
  const names = nameOf({ z: 'Twin', a: 'Twin' });
  assert.deepEqual(
    sortInitiative(list, names).map((p) => p.id),
    ['a', 'z'],
  );
  // Reversed input sorts identically — the id tie-break is total and stable.
  assert.deepEqual(
    sortInitiative([...list].reverse(), names).map((p) => p.id),
    ['a', 'z'],
  );
});

test('sortInitiative falls back to the id tie-break with no name resolver', () => {
  const list = [createParticipant('z', 10), createParticipant('a', 10)];
  assert.deepEqual(
    sortInitiative(list).map((p) => p.id),
    ['a', 'z'],
  );
});

test('startCombat sorts and starts at round 1, first turn', () => {
  const state = startCombat([createParticipant('a', 8), createParticipant('b', 15)]);
  assert.equal(state.round, 1);
  assert.equal(state.index, 0);
  assert.equal(currentParticipant(state)?.id, 'b');
  assert.equal(state.startedAt, 0, 'no injected start time reads as 0');
});

test('startCombat carries the injected start time', () => {
  const state = startCombat([createParticipant('a', 8)], undefined, 1700000000000);
  assert.equal(state.startedAt, 1700000000000);
});

test('advanceTurn steps through the order then wraps into the next round', () => {
  const state = startCombat([createParticipant('a', 15), createParticipant('b', 8)]);
  let result = advanceTurn(state);
  assert.equal(result.wrapped, false);
  assert.equal(currentParticipant(result.state)?.id, 'b');
  assert.equal(result.state.round, 1);

  result = advanceTurn(result.state);
  assert.equal(result.wrapped, true);
  assert.equal(result.state.round, 2);
  assert.equal(currentParticipant(result.state)?.id, 'a');
});

test('advanceTurn on an empty order is a no-op', () => {
  const state = startCombat([]);
  const result = advanceTurn(state);
  assert.equal(result.wrapped, false);
  assert.deepEqual(result.state, state);
  assert.equal(currentParticipant(state), null);
});

test('dropParticipant keeps the turn on the same combatant', () => {
  const state = startCombat([
    createParticipant('a', 20),
    createParticipant('b', 15),
    createParticipant('c', 10),
  ]);
  const onC = { ...state, index: 2 };
  // Removing someone earlier in the order shifts the pointer back with them.
  const withoutA = dropParticipant(onC, 'a');
  assert.deepEqual(
    withoutA.order.map((p) => p.id),
    ['b', 'c'],
  );
  assert.equal(currentParticipant(withoutA)?.id, 'c');
  // Removing someone later leaves the pointer where it is.
  const withoutC = dropParticipant({ ...state, index: 0 }, 'c');
  assert.equal(currentParticipant(withoutC)?.id, 'a');
});

test('dropParticipant wraps the pointer when the last combatant leaves on its turn', () => {
  const state = {
    ...startCombat([createParticipant('a', 20), createParticipant('b', 10)]),
    index: 1,
  };
  const next = dropParticipant(state, 'b');
  assert.equal(next.index, 0);
  assert.equal(currentParticipant(next)?.id, 'a');
});

test('dropParticipant empties an order down to nothing and ignores an absent id', () => {
  const state = startCombat([createParticipant('a', 20)]);
  const empty = dropParticipant(state, 'a');
  assert.deepEqual(empty.order, []);
  assert.equal(empty.index, 0);
  assert.equal(currentParticipant(empty), null);
  assert.equal(dropParticipant(state, 'nobody'), state, 'an absent id returns the same state');
});
