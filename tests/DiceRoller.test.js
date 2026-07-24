import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roll, rollDamage, emptySelection, formatResult, DIE_SIDES } from '../src/dice/DiceRoller.js';

test('rolls correct count of dice per die type', () => {
  const selection = emptySelection();
  selection.counts.d6 = 3;
  const result = roll(selection, () => 0.5);
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].rolls.length, 3);
});

test('rng of 0 maps to 1, rng just under 1 maps to max side value', () => {
  const selection = emptySelection();
  selection.counts.d20 = 1;

  const min = roll(selection, () => 0);
  assert.equal(min.results[0].rolls[0], 1);

  const max = roll(selection, () => 0.999999);
  assert.equal(max.results[0].rolls[0], DIE_SIDES.d20);
});

test('applies flat modifier to total', () => {
  const selection = emptySelection();
  selection.counts.d4 = 2;
  selection.modifier = 3;
  const result = roll(selection, () => 0.5);
  assert.equal(result.total, result.results[0].subtotal + 3);
});

test('combines multiple die types in one roll', () => {
  const selection = emptySelection();
  selection.counts.d6 = 1;
  selection.counts.d20 = 1;
  selection.modifier = -2;
  const result = roll(selection, () => 0);
  assert.equal(result.results.length, 2);
  assert.equal(result.total, 1 + 1 - 2);
});

test('ignores zero-count die types', () => {
  const selection = emptySelection();
  selection.counts.d6 = 0;
  selection.counts.d8 = 2;
  const result = roll(selection, () => 0);
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].die, 'd8');
});

test('formatResult lists each die group, the nonzero modifier, and the total', () => {
  const selection = emptySelection();
  selection.counts.d6 = 2;
  selection.modifier = 3;
  const result = roll(selection, () => 0.5);
  assert.equal(formatResult(result), 'd6[4,4]=8 + modifier=3 -> total: 11');

  selection.modifier = 0;
  assert.equal(formatResult(roll(selection, () => 0.5)), 'd6[4,4]=8 -> total: 8');
});

test('emptySelection rolls to just the modifier', () => {
  const selection = emptySelection();
  selection.modifier = 5;
  const result = roll(selection, () => 0.5);
  assert.equal(result.total, 5);
  assert.equal(result.results.length, 0);
});

test('rollDamage rolls each term and groups totals by damage type', () => {
  const result = rollDamage(
    [
      { count: 2, sides: 6, damageType: 'slashing' },
      { count: 1, sides: 4, damageType: 'fire' },
    ],
    0,
    () => 0.5,
  );
  assert.equal(result.byType.length, 2);
  assert.deepEqual(result.byType[0], { damageType: 'slashing', rolls: [4, 4], subtotal: 8 });
  assert.deepEqual(result.byType[1], { damageType: 'fire', rolls: [3], subtotal: 3 });
  assert.equal(result.total, 11);
  assert.equal(result.text, '8 slashing + 3 fire');
});

test('rollDamage folds the modifier into the first term, never below zero', () => {
  const boosted = rollDamage([{ count: 1, sides: 6, damageType: 'piercing' }], 3, () => 0.5);
  assert.equal(boosted.byType[0].subtotal, 7);
  assert.equal(boosted.total, 7);

  const floored = rollDamage([{ count: 1, sides: 6, damageType: 'piercing' }], -10, () => 0.5);
  assert.equal(floored.byType[0].subtotal, 0);
  assert.equal(floored.total, 0);
});

test('rollDamage merges terms sharing a damage type and skips empty terms', () => {
  const result = rollDamage(
    [
      { count: 1, sides: 6, damageType: 'slashing' },
      { count: 1, sides: 4, damageType: 'slashing' },
      { count: 0, sides: 12, damageType: 'fire' },
    ],
    0,
    () => 0.5,
  );
  assert.equal(result.byType.length, 1);
  assert.deepEqual(result.byType[0].rolls, [4, 3]);
  assert.equal(result.text, '7 slashing');
});
