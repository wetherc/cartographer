import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  POINT_BUY_BUDGET,
  STANDARD_ARRAY,
  pointBuyRemaining,
  isStandardArray,
  repairStandardArray,
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

test('isStandardArray accepts exactly one of each array value', () => {
  assert.ok(isStandardArray({ STR: 8, DEX: 10, CON: 12, INT: 13, WIS: 14, CHA: 15 }));
  assert.ok(!isStandardArray({ STR: 8, DEX: 10, CON: 12, INT: 13, WIS: 14, CHA: 14 }));
  assert.ok(!isStandardArray({ STR: 15, DEX: 14, CON: 13, INT: 12, WIS: 10 }));
});

test('repairStandardArray swaps the duplicated value to the missing one', () => {
  const scores = { STR: 15, DEX: 14, CON: 13, INT: 12, WIS: 10, CHA: 8 };
  const repaired = repairStandardArray({ ...scores, STR: 14 }, 'STR');
  assert.equal(repaired.STR, 14);
  assert.equal(repaired.DEX, 15); // took the value STR gave up
  assert.ok(isStandardArray(repaired));
});

test('repairStandardArray leaves non-array and ambiguous states alone', () => {
  const scores = { STR: 15, DEX: 14, CON: 13, INT: 12, WIS: 10, CHA: 8 };
  // A half-typed "1" on the way to "14" must not be overwritten.
  const midTyping = { ...scores, STR: 1 };
  assert.equal(repairStandardArray(midTyping, 'STR'), midTyping);
  // An array value with no duplicate holder has nothing to swap.
  assert.equal(repairStandardArray(scores, 'STR'), scores);
  // Two discrepancies (already-broken state) stay untouched.
  const broken = { ...scores, DEX: 15, CON: 15 };
  assert.equal(repairStandardArray(broken, 'DEX'), broken);
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
