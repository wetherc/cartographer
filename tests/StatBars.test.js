import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CRITICAL_RATIO,
  barReadout,
  ordinal,
  pipReadout,
  slotColumnLabel,
  slotLineReadout,
} from '../src/view/StatBars.js';

/** @param {number} current @param {number} max @param {object} [extra] */
function pool(current, max, extra = {}) {
  return { id: 'hp', name: 'HP', current, max, ...extra };
}

test('the fill width is the rounded percentage of the pool', () => {
  assert.equal(barReadout(pool(12, 12), { label: 'HP' }).percent, 100);
  assert.equal(barReadout(pool(6, 12), { label: 'HP' }).percent, 50);
  assert.equal(barReadout(pool(1, 3), { label: 'HP' }).percent, 33);
});

test('a pool with no maximum reads as empty rather than dividing by zero', () => {
  const readout = barReadout(pool(0, 0), { label: 'HP' });
  assert.equal(readout.percent, 0);
  assert.equal(readout.text, '0/0');
});

test('the critical state arms at the threshold and only for a bar that wants it', () => {
  const low = pool(3, 12); // exactly the threshold
  assert.equal(barReadout(low, { label: 'HP', critical: true }).critical, true);
  assert.equal(barReadout(pool(4, 12), { label: 'HP', critical: true }).critical, false);
  assert.equal(barReadout(low, { label: 'HP' }).critical, false);
  assert.equal(CRITICAL_RATIO, 0.25);
});

test('the accessible name spells the numbers out and mentions bonus points', () => {
  assert.equal(barReadout(pool(7, 12), { label: 'HP' }).ariaLabel, 'HP 7 of 12');
  assert.equal(
    barReadout(pool(7, 12), { label: 'HP', bonus: 4 }).ariaLabel,
    'HP 7 of 12, plus 4 bonus',
  );
  // Zero bonus points are no bonus at all, not "plus 0".
  assert.equal(barReadout(pool(7, 12), { label: 'HP', bonus: 0 }).ariaLabel, 'HP 7 of 12');
});

test('ordinals cover the spell levels a caster can reach', () => {
  assert.deepEqual([1, 2, 3, 4, 9].map(ordinal), ['1st', '2nd', '3rd', '4th', '9th']);
});

test("a pact pool's column says so; an ordinary one is just its level", () => {
  assert.equal(
    slotColumnLabel({ id: 'slots-3', name: 'Level 3 slots', current: 2, max: 3 }),
    '3rd',
  );
  assert.equal(
    slotColumnLabel({ id: 'pact-2', name: 'Pact slots', current: 2, max: 2 }),
    '2nd pact',
  );
});

const slots = { id: 'slots-2', name: 'Level 2 slots', current: 1, max: 3 };

test('an unspent pip offers to be spent', () => {
  assert.deepEqual(pipReadout(slots, true, true), {
    ariaLabel: 'Spend a level 2 slot',
    title: 'Click to spend',
    disabled: false,
  });
});

test('a spent pip the GM is looking at offers to be put back', () => {
  assert.deepEqual(pipReadout(slots, false, true), {
    ariaLabel: 'Restore a level 2 slot',
    title: 'Click to restore',
    disabled: false,
  });
});

test('a spent pip a player may not refill stays visible but stops being a control', () => {
  const readout = pipReadout(slots, false, false);
  assert.equal(readout.disabled, true);
  assert.equal(readout.ariaLabel, 'Spent level 2 slot, restored by the GM');
  assert.equal(readout.title, 'Only the GM can restore slots');
});

test('a pact pip names itself a pact slot', () => {
  const pact = { id: 'pact-3', name: 'Pact slots', current: 1, max: 2 };
  assert.equal(pipReadout(pact, true, true).ariaLabel, 'Spend a level 3 pact slot');
});

test('the read-only line lists every pool in one sentence', () => {
  assert.equal(
    slotLineReadout([
      { id: 'slots-1', name: 'Level 1 slots', current: 3, max: 4 },
      { id: 'pact-2', name: 'Pact slots', current: 0, max: 2 },
    ]),
    'Spell slots — level 1 slots: 3 of 4, level 2 pact slots: 0 of 2',
  );
});

test('a non-caster has nothing to read out', () => {
  assert.equal(slotLineReadout([]), 'Spell slots — ');
});
