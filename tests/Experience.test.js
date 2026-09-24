import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_LEVEL,
  XP_THRESHOLDS,
  levelForXp,
  xpForLevel,
  xpForNextLevel,
} from '../src/entities/Experience.js';

test('xpForLevel reads the SRD table and clamps a level outside it', () => {
  assert.equal(xpForLevel(1), 0);
  assert.equal(xpForLevel(5), 6500);
  assert.equal(xpForLevel(20), 355000);
  assert.equal(xpForLevel(0), 0);
  assert.equal(xpForLevel(Number.NaN), 0);
  assert.equal(xpForLevel(99), 355000);
});

test('levelForXp is the highest level whose start the total reaches', () => {
  assert.equal(levelForXp(0), 1);
  assert.equal(levelForXp(299), 1);
  assert.equal(levelForXp(300), 2);
  assert.equal(levelForXp(6500), 5);
  assert.equal(levelForXp(1e9), MAX_LEVEL);
  assert.equal(levelForXp(Number.NaN), 1);
  for (let level = 1; level <= MAX_LEVEL; level += 1) {
    assert.equal(levelForXp(XP_THRESHOLDS[level - 1]), level);
  }
});

test('xpForNextLevel names the next start, and nothing at the top', () => {
  assert.equal(xpForNextLevel(1), 300);
  assert.equal(xpForNextLevel(19), 355000);
  assert.equal(xpForNextLevel(MAX_LEVEL), null);
});
