import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COVER_LEVELS, coverBonus, coverNote } from '../src/combat/Cover.js';

test('COVER_LEVELS holds the three levels the dialog offers', () => {
  assert.deepEqual(
    COVER_LEVELS.map((level) => level.value),
    ['none', 'half', 'three-quarters'],
  );
});

test('coverBonus gives the AC each level of cover adds', () => {
  assert.equal(coverBonus('none'), 0);
  assert.equal(coverBonus('half'), 2);
  assert.equal(coverBonus('three-quarters'), 5);
});

test('coverBonus reads an absent or unknown answer as no cover', () => {
  assert.equal(coverBonus(undefined), 0);
  assert.equal(coverBonus('total'), 0);
  assert.equal(coverBonus(2), 0);
});

test('coverNote names the cover for the log and stays quiet without it', () => {
  assert.equal(coverNote('half'), 'half cover +2');
  assert.equal(coverNote('three-quarters'), 'three-quarters cover +5');
  assert.equal(coverNote('none'), '');
  assert.equal(coverNote(undefined), '');
});
