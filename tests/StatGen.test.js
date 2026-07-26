import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  POINT_BUY_BUDGET,
  STANDARD_ARRAY,
  pointBuyRemaining,
  rollAbility,
  rollScores,
} from '../src/entities/StatGen.js';

/** @param {number[]} rolls a fixed d6 sequence (values 1-6) */
function fixedRng(rolls) {
  let i = 0;
  return () => (rolls[i++ % rolls.length] - 1) / 6;
}

test('pointBuyRemaining prices the 5e cost table against the budget', () => {
  assert.equal(pointBuyRemaining({ STR: 8, DEX: 8, CON: 8, INT: 8, WIS: 8, CHA: 8 }), 27);
  // 15/15/15 costs 27: the classic three-max spread spends everything.
  assert.equal(pointBuyRemaining({ STR: 15, DEX: 15, CON: 15, INT: 8, WIS: 8, CHA: 8 }), 0);
  assert.equal(pointBuyRemaining({ STR: 15, DEX: 15, CON: 15, INT: 9, WIS: 8, CHA: 8 }), -1);
  assert.equal(POINT_BUY_BUDGET, 27);
});

test('pointBuyRemaining is null when a score is outside 8-15', () => {
  assert.equal(pointBuyRemaining({ STR: 7, DEX: 8 }), null);
  assert.equal(pointBuyRemaining({ STR: 16, DEX: 8 }), null);
  assert.equal(pointBuyRemaining({ STR: NaN, DEX: 8 }), null);
});

test('rollAbility sums 4d6 and drops the lowest', () => {
  assert.equal(rollAbility(fixedRng([6, 5, 4, 1])), 15);
  assert.equal(rollAbility(fixedRng([1, 1, 1, 1])), 3);
  assert.equal(rollAbility(fixedRng([6, 6, 6, 6])), 18);
});

test('rollScores fills every key within the 3-18 range', () => {
  const scores = rollScores(['STR', 'DEX', 'CON'], Math.random);
  assert.deepEqual(Object.keys(scores), ['STR', 'DEX', 'CON']);
  for (const v of Object.values(scores)) assert.ok(v >= 3 && v <= 18);
});

test('the standard array is the 5e six', () => {
  assert.deepEqual(STANDARD_ARRAY, [15, 14, 13, 12, 10, 8]);
});
