import { test } from 'node:test';
import assert from 'node:assert/strict';

import { statFields, readStats } from '../src/app/statFields.js';
import { STAT_KEYS, ABILITY_SCORES } from '../src/entities/Modifiers.js';

test('STAT_KEYS is the ability scores plus AC', () => {
  assert.deepEqual(STAT_KEYS, [...ABILITY_SCORES, 'AC']);
});

test('statFields builds one stat- field per key from the given block', () => {
  const fields = statFields(STAT_KEYS, { STR: 14, AC: 16 });
  assert.equal(fields.length, STAT_KEYS.length);
  assert.equal(fields[0].name, 'stat-STR');
  assert.equal(fields[0].value, 14);
  assert.equal(fields[fields.length - 1].name, 'stat-AC');
  assert.equal(fields[fields.length - 1].value, 16);
  const dex = fields.find((f) => f.name === 'stat-DEX');
  assert.equal(dex.value, 10, 'missing stats default to 10');
  assert.equal(dex.min, 1);
});

test('readStats clamps each stat to a positive integer, defaulting garbage to 10', () => {
  const stats = readStats(ABILITY_SCORES, {
    'stat-STR': '18',
    'stat-DEX': '0',
    'stat-CON': '-3',
    'stat-INT': 'abc',
    'stat-WIS': '',
  });
  assert.equal(stats.STR, 18);
  assert.equal(stats.DEX, 10, 'zero reads as the 10 default');
  assert.equal(stats.CON, 1, 'negatives clamp to 1');
  assert.equal(stats.INT, 10, 'non-numeric reads as 10');
  assert.equal(stats.WIS, 10, 'blank reads as 10');
  assert.equal(stats.CHA, 10, 'missing reads as 10');
});
