import { test } from 'node:test';
import assert from 'node:assert/strict';
import { effectiveStat } from '../src/entities/Stats.js';
import { addItem, createCharacter } from '../src/entities/Character.js';
import { equip } from '../src/entities/Equipment.js';
import { addStatModifier, createCreature } from '../src/entities/Creature.js';
import { item } from './helpers/fixtures.js';

/** A character wearing a ring that shifts STR by `delta`. */
function ringBearer(delta = 2) {
  let hero = createCharacter('c1', 'Hero', { STR: 14 });
  hero = addItem(
    hero,
    item('ring', 'Ring of Vigor', { type: 'ring', statBonuses: { STR: delta } }),
  );
  return equip(hero, 'accessory', 'ring');
}

test('a stat with no source at all reads as its base value', () => {
  const hero = createCharacter('c1', 'Hero', { STR: 14 });
  assert.deepEqual(effectiveStat(hero, 'STR'), { base: 14, total: 14, rounds: 0, sources: [] });
  const goblin = createCreature('e1', 'Goblin', { maxHP: 10, stats: { STR: 8 }, level: 1 });
  assert.deepEqual(effectiveStat(goblin, 'STR'), { base: 8, total: 8, rounds: 0, sources: [] });
});

test('an unknown ability reads as 10 rather than as undefined', () => {
  assert.deepEqual(effectiveStat(createCharacter('c1', 'Hero'), 'LUK'), {
    base: 10,
    total: 10,
    rounds: 0,
    sources: [],
  });
});

test('equipment alone is listed by item name, with no countdown', () => {
  const hero = ringBearer();
  assert.deepEqual(effectiveStat(hero, 'STR'), {
    base: 14,
    total: 16,
    rounds: 0,
    sources: [{ source: 'Ring of Vigor', delta: 2 }],
  });
  // A carried but unworn item is no source.
  const carrying = addItem(
    createCharacter('c2', 'Squire', { STR: 14 }),
    item('ring', 'Ring of Vigor', { type: 'ring', statBonuses: { STR: 2 } }),
  );
  assert.deepEqual(effectiveStat(carrying, 'STR').sources, []);
});

test('a debuffing item shows its negative delta and lowers the total', () => {
  assert.deepEqual(effectiveStat(ringBearer(-3), 'STR'), {
    base: 14,
    total: 11,
    rounds: 0,
    sources: [{ source: 'Ring of Vigor', delta: -3 }],
  });
});

test('timed modifiers alone stack, and rounds reports the longest one', () => {
  let goblin = createCreature('e1', 'Goblin', { maxHP: 10, stats: { STR: 8 }, level: 1 });
  goblin = addStatModifier(goblin, 'STR', 2, 3);
  goblin = addStatModifier(goblin, 'STR', 1, 5);
  goblin = addStatModifier(goblin, 'DEX', 4, 9);
  assert.deepEqual(effectiveStat(goblin, 'STR'), {
    base: 8,
    total: 11,
    rounds: 5,
    sources: [
      { source: 'Adjustment', delta: 2, rounds: 3 },
      { source: 'Adjustment', delta: 1, rounds: 5 },
    ],
  });
  assert.equal(effectiveStat(goblin, 'DEX').total, 14, 'a modifier reaches only its own stat');
});

test('both source kinds fold into one total, equipment first', () => {
  const hero = ringBearer();
  const buffed = /** @type {any} */ ({ ...hero, statMods: [{ stat: 'STR', delta: 3, rounds: 2 }] });
  assert.deepEqual(effectiveStat(buffed, 'STR'), {
    base: 14,
    total: 19,
    rounds: 2,
    sources: [
      { source: 'Ring of Vigor', delta: 2 },
      { source: 'Adjustment', delta: 3, rounds: 2 },
    ],
  });
});

test("an encounter's worn armor is not a stat source, so the chips show the authored AC", () => {
  // effectiveStatBlock adds the armor bonus for combat math. This fold reports
  // what a GM authored, which is what the stat chips edit.
  const goblin = createCreature('e1', 'Goblin', { maxHP: 10, stats: { AC: 12 }, level: 1 });
  assert.equal(goblin.armor?.acBonus, 1);
  assert.deepEqual(effectiveStat(goblin, 'AC'), { base: 12, total: 12, rounds: 0, sources: [] });
});
