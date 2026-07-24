import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abilityModifier, formatModifier, defaultEnemyStats, normalizeStatBlock, ENEMY_TIERS, STAT_KEYS } from '../src/entities/Modifiers.js';

test('abilityModifier follows the standard step table', () => {
  assert.equal(abilityModifier(20), 5);
  assert.equal(abilityModifier(10), 0);
  assert.equal(abilityModifier(11), 0);
  assert.equal(abilityModifier(12), 1);
  assert.equal(abilityModifier(7), -2);
  assert.equal(abilityModifier(1), -5);
});

test('formatModifier signs positives and zero, leaves negatives', () => {
  assert.equal(formatModifier(5), '+5');
  assert.equal(formatModifier(0), '+0');
  assert.equal(formatModifier(-2), '-2');
});

test('mob defaults sit at baseline and creep with level, mentals trailing', () => {
  assert.deepEqual(defaultEnemyStats(1, 'mob'), { STR: 10, DEX: 10, CON: 10, INT: 8, WIS: 8, CHA: 8, AC: 10 });
  assert.equal(defaultEnemyStats(9, 'mob').STR, 13);
  assert.equal(defaultEnemyStats(9, 'mob').INT, 11);
  assert.equal(defaultEnemyStats(30, 'mob').STR, 18); // capped
});

test('legend defaults run above-normal and out-stat a level-matched mob', () => {
  assert.deepEqual(defaultEnemyStats(1, 'legend'), { STR: 14, DEX: 14, CON: 14, INT: 14, WIS: 14, CHA: 14, AC: 12 });
  assert.equal(defaultEnemyStats(20, 'legend').STR, 24);
  assert.equal(defaultEnemyStats(40, 'legend').STR, 26); // capped
  for (const level of [1, 5, 10, 20]) {
    assert.ok(defaultEnemyStats(level, 'legend').STR > defaultEnemyStats(level, 'mob').STR);
  }
});

test('defaultEnemyStats tolerates junk levels', () => {
  assert.deepEqual(defaultEnemyStats(0, 'mob'), defaultEnemyStats(1, 'mob'));
  assert.deepEqual(defaultEnemyStats(NaN, 'legend'), defaultEnemyStats(1, 'legend'));
});

test('ENEMY_TIERS lists mob then legend', () => {
  assert.deepEqual(ENEMY_TIERS, ['mob', 'legend']);
});

test('STAT_KEYS is the six abilities plus AC', () => {
  assert.deepEqual(STAT_KEYS, ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA', 'AC']);
});

test('normalizeStatBlock drops custom stats and fills missing ones', () => {
  const block = normalizeStatBlock({ STR: 16, Speed: 30, AC: 15 });
  assert.equal(block.STR, 16);
  assert.equal(block.AC, 15);
  assert.equal(block.DEX, 10, 'missing abilities default to 10');
  assert.ok(!('Speed' in block), 'custom stats are dropped');
  assert.deepEqual(Object.keys(block).sort(), [...STAT_KEYS].sort());
});

test('normalizeStatBlock derives a missing AC from DEX', () => {
  assert.equal(normalizeStatBlock({}).AC, 10);
  assert.equal(normalizeStatBlock({ DEX: 16 }).AC, 13);
  assert.equal(normalizeStatBlock({ DEX: 7 }).AC, 8);
});
