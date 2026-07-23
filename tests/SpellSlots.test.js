import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  slotsForLevel,
  withSpellSlots,
  syncSlotsToLevel,
  migrateManaToSlots,
  getSlotPools,
  isSlotPool,
} from '../src/entities/SpellSlots.js';
import {
  createCharacter,
  withHP,
  addResource,
  addXP,
  spendResource,
  shortRest,
  longRest,
  getHP,
} from '../src/entities/Character.js';
import { createResource } from '../src/entities/Resource.js';

test('slotsForLevel follows the full-caster table and clamps past 20', () => {
  assert.deepEqual(slotsForLevel(1), [2]);
  assert.deepEqual(slotsForLevel(3), [4, 2]);
  assert.deepEqual(slotsForLevel(5), [4, 3, 2]);
  assert.deepEqual(slotsForLevel(20), [4, 3, 3, 3, 3, 2, 2, 1, 1]);
  assert.deepEqual(slotsForLevel(25), slotsForLevel(20));
  assert.deepEqual(slotsForLevel(0), []);
});

test('withSpellSlots creates full pools per the table, ordered HP then slots then custom', () => {
  let mage = withHP(createCharacter('c1', 'Mage'), 10);
  mage = addResource(mage, createResource('ki', 'Ki', 'custom', 3));
  mage = { ...mage, level: 3 };
  mage = withSpellSlots(mage);
  assert.deepEqual(
    mage.resources.map((r) => r.id),
    ['hp', 'slots-1', 'slots-2', 'ki'],
  );
  const pools = getSlotPools(mage);
  assert.deepEqual(pools.map((p) => p.max), [4, 2]);
  assert.deepEqual(pools.map((p) => p.current), [4, 2]);
  assert.equal(pools.every((p) => isSlotPool(p)), true);
});

test('syncSlotsToLevel grows maxima by the gained capacity, keeping spent slots spent', () => {
  let mage = withSpellSlots(createCharacter('c1', 'Mage')); // level 1: [2]
  mage = spendResource(mage, 'slots-1', 1); // 1/2 left
  mage = { ...mage, level: 3 };
  mage = syncSlotsToLevel(mage);
  const pools = getSlotPools(mage);
  // Level 3: [4, 2]. L1 grew 2 -> 4 (+2 capacity onto 1 remaining = 3); L2 is new, full.
  assert.deepEqual(pools.map((p) => ({ max: p.max, current: p.current })), [
    { max: 4, current: 3 },
    { max: 2, current: 2 },
  ]);
});

test('syncSlotsToLevel leaves a non-caster untouched', () => {
  const fighter = { ...withHP(createCharacter('c1', 'Fighter'), 10), level: 5 };
  assert.equal(syncSlotsToLevel(fighter), fighter);
});

test('addXP levels a caster into new slot pools', () => {
  let mage = withSpellSlots(withHP(createCharacter('c1', 'Mage'), 10));
  mage = addXP(mage, 320); // level 1 -> 3
  assert.deepEqual(getSlotPools(mage).map((p) => p.max), [4, 2]);
});

test('a short rest heals HP but leaves spent slots spent; a long rest refills them', () => {
  let mage = withSpellSlots(withHP(createCharacter('c1', 'Mage'), 10));
  mage = spendResource(mage, 'hp', 6);
  mage = spendResource(mage, 'slots-1', 2);

  const rested = shortRest(mage);
  assert.equal(getHP(rested).current, 9, 'short rest restores half of max HP');
  assert.equal(getSlotPools(rested)[0].current, 0, 'slots untouched by a short rest');

  const slept = longRest(mage);
  assert.equal(getHP(slept).current, 10);
  assert.equal(getSlotPools(slept)[0].current, 2, 'long rest refills slots');
});

test('migrateManaToSlots swaps the mana pool for level-appropriate slots, once', () => {
  let mage = withHP(createCharacter('c1', 'Mage'), 10);
  mage = addResource(mage, createResource('mana', 'Mana', 'mana', 8));
  const migrated = migrateManaToSlots(mage);
  assert.equal(migrated.resources.some((r) => r.id === 'mana'), false);
  assert.deepEqual(getSlotPools(migrated).map((p) => p.max), [2]);
  assert.equal(migrateManaToSlots(migrated), migrated, 'no mana pool: untouched');
});
