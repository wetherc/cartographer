import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createParticipant,
  sortInitiative,
  startCombat,
  currentParticipant,
  advanceTurn,
  dropParticipant,
  addParticipant,
} from '../src/combat/Initiative.js';
import { freshBudget, spend } from '../src/combat/ActionBudget.js';

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

test('advanceTurn skips defeated participants to the next one standing', () => {
  const state = startCombat([
    createParticipant('a', 20),
    createParticipant('b', 15),
    createParticipant('c', 10),
  ]);
  const result = advanceTurn(state, (p) => p.id === 'b');
  assert.equal(currentParticipant(result.state)?.id, 'c');
  assert.equal(result.wrapped, false);
  assert.equal(result.state.round, 1);
});

test('advanceTurn skipping past the end still turns the round over once', () => {
  const state = {
    ...startCombat([createParticipant('a', 20), createParticipant('b', 15)]),
    index: 0,
  };
  // b is down, so a's next turn is the whole of round 2.
  const result = advanceTurn(state, (p) => p.id === 'b');
  assert.equal(currentParticipant(result.state)?.id, 'a');
  assert.equal(result.wrapped, true);
  assert.equal(result.state.round, 2);
});

test('advanceTurn with everyone defeated cycles once and keeps the round ticking', () => {
  const state = startCombat([createParticipant('a', 20), createParticipant('b', 15)]);
  const result = advanceTurn(state, () => true);
  assert.equal(result.state.index, state.index, 'a full cycle lands where it started');
  assert.equal(result.wrapped, true);
  assert.equal(result.state.round, 2);
});

test('advanceTurn on an empty order is a no-op', () => {
  const state = startCombat([]);
  const result = advanceTurn(state);
  assert.equal(result.wrapped, false);
  assert.deepEqual(result.state, state);
  assert.equal(currentParticipant(state), null);
});

test('createParticipant starts with a whole action budget', () => {
  assert.deepEqual(createParticipant('a').used, freshBudget());
});

test('advanceTurn gives the combatant it lands on a fresh budget', () => {
  const state = startCombat([createParticipant('a', 20), createParticipant('b', 15)]);
  const spent = { ...state, order: [state.order[0], spend(state.order[1], 'reaction')] };
  const result = advanceTurn(spent);
  assert.equal(currentParticipant(result.state)?.id, 'b');
  assert.deepEqual(result.state.order[1].used, freshBudget(), 'b opens its turn unspent');
});

test('advanceTurn leaves a skipped combatant with its spent budget', () => {
  const state = startCombat([
    createParticipant('a', 20),
    createParticipant('b', 15),
    createParticipant('c', 10),
  ]);
  const spent = {
    ...state,
    order: [state.order[0], spend(state.order[1], 'bonus'), state.order[2]],
  };
  const result = advanceTurn(spent, (p) => p.id === 'b');
  assert.equal(currentParticipant(result.state)?.id, 'c');
  assert.equal(result.state.order[1].used?.bonus, true, 'b never got a turn to refresh');
});

test('advanceTurn gives everyone their Sneak Attack back, not just the lander', () => {
  // Once per turn means anyone's turn, so a rogue that spent the dice on its
  // own swing gets them back for an opportunity attack on the next turn.
  const state = startCombat([createParticipant('a', 20), createParticipant('b', 15)]);
  const spent = {
    ...state,
    order: [spend(spend(state.order[0], 'action'), 'sneak'), state.order[1]],
  };
  const result = advanceTurn(spent);
  assert.equal(currentParticipant(result.state)?.id, 'b');
  assert.equal(result.state.order[0].used?.sneak, false, 'the flag re-arms on the new turn');
  assert.equal(result.state.order[0].used?.action, true, 'the rest of the spent turn stays spent');
});

test('advanceTurn keeps the order identity when the turn spent nothing', () => {
  const state = startCombat([createParticipant('a', 20), createParticipant('b', 15)]);
  const result = advanceTurn(state);
  assert.equal(result.state.order, state.order, 'no rewrite, so the caches stay warm');
});

test('advanceTurn refreshes a participant whose budget the save left out', () => {
  const state = startCombat([createParticipant('a', 20), createParticipant('b', 15)]);
  const legacy = { ...state, order: [state.order[0], { id: 'b', initiative: 15, modifier: 0 }] };
  const result = advanceTurn(legacy);
  assert.equal(result.state.order, legacy.order, 'an absent budget already reads as fresh');
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

test('addParticipant sorts the newcomer in and keeps the turn where it is', () => {
  const state = {
    ...startCombat([createParticipant('a', 20), createParticipant('c', 10)]),
    index: 1,
  };
  // The newcomer sorts above the combatant holding the turn, so it acts for
  // the first time next round.
  const above = addParticipant(state, createParticipant('b', 15));
  assert.deepEqual(
    above.order.map((p) => p.id),
    ['a', 'b', 'c'],
  );
  assert.equal(currentParticipant(above)?.id, 'c');
  // A newcomer sorting below leaves the pointer alone too.
  const below = addParticipant({ ...state, index: 0 }, createParticipant('d', 5));
  assert.deepEqual(
    below.order.map((p) => p.id),
    ['a', 'c', 'd'],
  );
  assert.equal(currentParticipant(below)?.id, 'a');
});

test('addParticipant breaks an initiative tie by name, like the setup sort', () => {
  const state = startCombat([createParticipant('a', 12)], nameOf({ a: 'Zed', b: 'Ana' }));
  const next = addParticipant(state, createParticipant('b', 12), nameOf({ a: 'Zed', b: 'Ana' }));
  assert.deepEqual(
    next.order.map((p) => p.id),
    ['b', 'a'],
  );
  assert.equal(currentParticipant(next)?.id, 'a', 'the turn stays on the combatant that held it');
});

test('addParticipant refuses a duplicate id and joins an empty order', () => {
  const state = startCombat([createParticipant('a', 20)]);
  assert.equal(
    addParticipant(state, createParticipant('a', 5)),
    state,
    'an id already in the order returns the same state',
  );
  const empty = { round: 1, index: 0, order: [], startedAt: 0 };
  const joined = addParticipant(empty, createParticipant('a', 7));
  assert.deepEqual(
    joined.order.map((p) => p.id),
    ['a'],
  );
  assert.equal(joined.index, 0);
});

test('dropParticipant refreshes the budget of the combatant that inherits the turn', () => {
  const b = spend(spend(createParticipant('b', 15), 'reaction'), 'bonusAction');
  const state = {
    ...startCombat([createParticipant('a', 20), b, createParticipant('c', 10)]),
    index: 0,
  };
  const next = dropParticipant(state, 'a');
  assert.equal(currentParticipant(next)?.id, 'b');
  assert.deepEqual(next.order[0].used, freshBudget(), 'the inherited turn starts whole');
});

test('dropParticipant leaves budgets alone when the dropped combatant did not hold the turn', () => {
  const c = spend(createParticipant('c', 10), 'reaction');
  const state = {
    ...startCombat([createParticipant('a', 20), createParticipant('b', 15), c]),
    index: 0,
  };
  const next = dropParticipant(state, 'b');
  assert.equal(currentParticipant(next)?.id, 'a');
  assert.equal(next.order[1].used.reaction, true, 'a later combatant keeps its spent reaction');
});

test('dropParticipant refreshes the top of the order when the last combatant leaves on its turn', () => {
  const a = spend(createParticipant('a', 20), 'action');
  const state = { ...startCombat([a, createParticipant('b', 10)]), index: 1 };
  const next = dropParticipant(state, 'b');
  assert.equal(currentParticipant(next)?.id, 'a');
  assert.equal(next.order[0].used.action, false);
});
