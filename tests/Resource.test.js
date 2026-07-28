import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createResource,
  spend,
  restore,
  setMax,
  adjustMax,
  growMax,
  spliceReservedPools,
  isEmpty,
} from '../src/entities/Resource.js';

/** @param {string} id @param {number} max @param {number} [current] */
const pool = (id, max, current = max) => ({
  ...createResource(id, id, 'custom', max),
  current,
});

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

test('adjustMax carries current by the whole delta, up and down', () => {
  const hp = pool('hp', 20, 12);
  assert.deepEqual(adjustMax(hp, 26), { ...hp, max: 26, current: 18 });
  assert.deepEqual(adjustMax(hp, 15), { ...hp, max: 15, current: 7 });
});

test('adjustMax keeps current inside the new bounds', () => {
  assert.equal(adjustMax(pool('hp', 20, 3), 5).current, 0, 'a big drop bottoms out at 0');
  assert.equal(adjustMax(pool('hp', 20, 20), 30).max, 30);
  assert.equal(adjustMax(pool('hp', 20, 20), 30).current, 30, 'a full pool stays full');
});

test('growMax carries a gain but never refunds a loss', () => {
  const dice = pool('hit-dice-d8', 5, 2);
  assert.equal(growMax(dice, 8).current, 5, 'the three gained dice arrive unspent');
  assert.equal(growMax(dice, 3).current, 2, 'losing capacity leaves the spent count alone');
  assert.equal(growMax(dice, 1).current, 1, 'current still clamps to the new max');
});

test('spliceReservedPools puts the replacements where the family sat', () => {
  const resources = [pool('hp', 10), pool('slots-1', 2), pool('slots-2', 1), pool('rations', 5)];
  const next = spliceReservedPools(resources, [pool('slots-1', 3)], (r) =>
    r.id.startsWith('slots-'),
  );
  assert.deepEqual(
    next.map((r) => r.id),
    ['hp', 'slots-1', 'rations'],
  );
  assert.equal(next[0], resources[0], 'the pools it keeps stay identical');
});

test('spliceReservedPools falls back to following the pools it is given', () => {
  const resources = [pool('rations', 5), pool('hp', 10), pool('torches', 3)];
  const owns = (/** @type {{ id: string }} */ r) => r.id.startsWith('slots-');
  const after = spliceReservedPools(resources, [pool('slots-1', 2)], owns, (r) => r.id === 'hp');
  assert.deepEqual(
    after.map((r) => r.id),
    ['rations', 'hp', 'slots-1', 'torches'],
  );
  assert.deepEqual(
    spliceReservedPools(resources, [pool('slots-1', 2)], owns).map((r) => r.id),
    ['rations', 'hp', 'torches', 'slots-1'],
    'with nothing to follow, the replacements append',
  );
});

test('spliceReservedPools with no replacements just drops the family', () => {
  const resources = [pool('hp', 10), pool('slots-1', 2)];
  assert.deepEqual(
    spliceReservedPools(resources, [], (r) => r.id.startsWith('slots-')).map((r) => r.id),
    ['hp'],
  );
});

test('isEmpty reflects current <= 0', () => {
  const arrows = createResource('r1', 'Arrows', 'item-count', 3);
  assert.equal(isEmpty(arrows), false);
  assert.equal(isEmpty(spend(arrows, 3)), true);
});
