import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  heldInspection,
  heldTarget,
  inspectKey,
  nextInspection,
  turnKey,
  viewTurnKey,
} from '../src/view/CombatSelection.js';
import { addParticipant, dropParticipant } from '../src/combat/Initiative.js';

const fight = (/** @type {number} */ round, /** @type {number} */ index) =>
  /** @type {any} */ ({
    round,
    index,
    order: [
      { id: 'mirelle', side: 'party' },
      { id: 'scout', side: 'foe' },
    ],
  });
const alive = () => false;

test('turnKey names the round and the turn holder, or null with no fight', () => {
  assert.equal(turnKey(fight(2, 1)), '2:scout');
  assert.equal(turnKey(null), null);
});

test('a target stays held on its own turn', () => {
  const next = heldTarget({
    selectedId: 'scout',
    heldTurn: '1:mirelle',
    combat: fight(1, 0),
    gone: alive,
  });
  assert.deepEqual(next, { selectedId: 'scout', heldTurn: '1:mirelle' });
});

test('a new turn, or a new round on the same index, releases the target', () => {
  for (const combat of [fight(1, 1), fight(2, 0)]) {
    const next = heldTarget({ selectedId: 'scout', heldTurn: '1:mirelle', combat, gone: alive });
    assert.equal(next.selectedId, null);
    assert.equal(next.heldTurn, turnKey(combat));
  }
});

test('a gone target, one out of the order, or an ended fight is released', () => {
  const combat = fight(1, 0);
  assert.equal(
    heldTarget({ selectedId: 'scout', heldTurn: '1:mirelle', combat, gone: () => true }).selectedId,
    null,
  );
  assert.equal(
    heldTarget({ selectedId: 'ghost', heldTurn: '1:mirelle', combat, gone: alive }).selectedId,
    null,
  );
  assert.deepEqual(
    heldTarget({ selectedId: 'scout', heldTurn: '1:mirelle', combat: null, gone: alive }),
    {
      selectedId: null,
      heldTurn: null,
    },
  );
});

test('with no target, the refresh only records the turn', () => {
  assert.deepEqual(
    heldTarget({ selectedId: null, heldTurn: null, combat: fight(3, 1), gone: alive }),
    {
      selectedId: null,
      heldTurn: '3:scout',
    },
  );
});

test('a target held with no fight running is released', () => {
  const next = heldTarget({ selectedId: 'scout', heldTurn: null, combat: null, gone: alive });
  assert.equal(next.selectedId, null);
});

const ordered = /** @type {any} */ ({
  round: 1,
  index: 1,
  order: [
    { id: 'wolf', initiative: 18, modifier: 2 },
    { id: 'mirelle', initiative: 14, modifier: 3 },
    { id: 'scout', initiative: 9, modifier: 2 },
  ],
});

test('a newcomer sorted above the holder keeps the turn key and the target', () => {
  const summoned = addParticipant(ordered, { id: 'sword', initiative: 20, modifier: 0 });
  assert.equal(summoned.index, 2);
  assert.equal(turnKey(summoned), turnKey(ordered));
  const next = heldTarget({
    selectedId: 'scout',
    heldTurn: turnKey(ordered),
    combat: summoned,
    gone: alive,
  });
  assert.equal(next.selectedId, 'scout');
});

test('a drop earlier in the order keeps the key, and a drop of the holder changes it', () => {
  const earlier = dropParticipant(ordered, 'wolf');
  assert.equal(earlier.index, 0);
  assert.equal(turnKey(earlier), turnKey(ordered));
  const holder = dropParticipant(ordered, 'mirelle');
  assert.equal(holder.index, 1);
  assert.equal(turnKey(holder), '1:scout');
  const next = heldTarget({
    selectedId: 'wolf',
    heldTurn: turnKey(ordered),
    combat: holder,
    gone: alive,
  });
  assert.equal(next.selectedId, null);
});

test('viewTurnKey reads the same key from a combat view', () => {
  const view = /** @type {any} */ ({
    round: 1,
    turnIndex: 1,
    rows: ordered.order.map((/** @type {{ id: string }} */ p) => ({ id: p.id })),
  });
  assert.equal(viewTurnKey(view), turnKey(ordered));
  assert.equal(viewTurnKey({ ...view, rows: [] }), '1:');
  assert.equal(turnKey({ ...ordered, order: [] }), '1:');
});

test('inspectKey names the fight and the turn, or null with no fight', () => {
  assert.equal(inspectKey({ ...fight(2, 1), startedAt: 50 }), '50|2:scout');
  assert.equal(inspectKey(fight(1, 0)), '0|1:mirelle');
  assert.equal(inspectKey(null), null);
});

test('an inspection stays for the rest of its turn', () => {
  const combat = { ...fight(1, 0), startedAt: 5 };
  const next = heldInspection({ inspectedId: 'scout', heldKey: '5|1:mirelle', combat });
  assert.deepEqual(next, { inspectedId: 'scout', heldKey: '5|1:mirelle' });
});

test('a new turn releases the inspection', () => {
  const combat = { ...fight(1, 1), startedAt: 5 };
  const next = heldInspection({ inspectedId: 'scout', heldKey: '5|1:mirelle', combat });
  assert.deepEqual(next, { inspectedId: null, heldKey: '5|1:scout' });
});

test('the end of a fight and the start of a new one release the inspection', () => {
  const ended = heldInspection({ inspectedId: 'scout', heldKey: '5|1:mirelle', combat: null });
  assert.deepEqual(ended, { inspectedId: null, heldKey: null });
  // A new fight can open on the same round and turn holder as the last one.
  const combat = { ...fight(1, 0), startedAt: 9 };
  const fresh = heldInspection({ inspectedId: 'scout', heldKey: '5|1:mirelle', combat });
  assert.deepEqual(fresh, { inspectedId: null, heldKey: '9|1:mirelle' });
});

test('a chip click inspects, and a click on the current or inspected chip follows the turn', () => {
  const now = { inspectedId: null, currentId: 'mirelle' };
  assert.equal(nextInspection('scout', now), 'scout');
  assert.equal(nextInspection('mirelle', now), null);
  assert.equal(nextInspection('scout', { inspectedId: 'scout', currentId: 'mirelle' }), null);
  assert.equal(nextInspection('wolf', { inspectedId: 'scout', currentId: 'mirelle' }), 'wolf');
});
