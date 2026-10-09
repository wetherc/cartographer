import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceTurn,
  canDelay,
  createParticipant,
  delayTurn,
  retreatTurn,
  setParticipantInitiative,
  startCombat,
} from '../src/combat/Initiative.js';

const fight = () =>
  startCombat([createParticipant('a', 18), createParticipant('b', 12), createParticipant('c', 5)]);

test('retreatTurn steps back one row and keeps budgets', () => {
  const moved = advanceTurn(fight()).state;
  const back = retreatTurn(moved);
  assert.equal(back.index, 0);
  assert.equal(back.round, 1);
  assert.equal(back.order, moved.order);
});

test('retreatTurn wraps to the last row of the round before', () => {
  let s = fight();
  for (let i = 0; i < 3; i += 1) s = advanceTurn(s).state;
  assert.deepEqual([s.round, s.index], [2, 0]);
  const back = retreatTurn(s);
  assert.deepEqual([back.round, back.index], [1, 2]);
});

test('retreatTurn does nothing on the first turn or an empty order', () => {
  const s = fight();
  assert.equal(retreatTurn(s), s);
  const empty = { round: 1, index: 0, order: [], startedAt: 0 };
  assert.equal(retreatTurn(empty), empty);
});

test('retreatTurn passes over defeated rows', () => {
  let s = fight();
  s = advanceTurn(advanceTurn(s).state).state;
  const back = retreatTurn(s, (p) => p.id === 'b');
  assert.equal(back.index, 0);
});

test('retreatTurn stops at round 1 when every earlier row is defeated', () => {
  const s = advanceTurn(fight()).state;
  assert.equal(
    retreatTurn(s, (p) => p.id === 'a'),
    s,
  );
});

test('setParticipantInitiative re-sorts and keeps the turn holder', () => {
  const s = advanceTurn(fight()).state; // b holds the turn
  const next = setParticipantInitiative(s, 'c', 20);
  assert.deepEqual(
    next.order.map((p) => p.id),
    ['c', 'a', 'b'],
  );
  assert.equal(next.order[next.index].id, 'b');
  assert.equal(next.order[0].initiative, 20);
});

test('setParticipantInitiative ignores an unknown id or an unchanged value', () => {
  const s = fight();
  assert.equal(setParticipantInitiative(s, 'zz', 3), s);
  assert.equal(setParticipantInitiative(s, 'a', 18), s);
});

test('delayTurn moves the holder after the next row and starts its turn', () => {
  const s = fight();
  const spent = { ...s, order: s.order.map((p) => ({ ...p, used: { ...p.used, action: true } })) };
  const next = delayTurn(spent);
  assert.deepEqual(
    next.order.map((p) => p.id),
    ['b', 'a', 'c'],
  );
  assert.equal(next.index, 0);
  assert.equal(next.order[1].initiative, 12);
  assert.equal(next.order[0].used.action, false);
  assert.equal(next.order[1].used.action, true);
});

test('delayTurn does nothing on the last row', () => {
  let s = fight();
  s = advanceTurn(advanceTurn(s).state).state;
  assert.equal(canDelay(s), false);
  assert.equal(delayTurn(s), s);
});
