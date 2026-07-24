import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  roll,
  rollDamage,
  emptySelection,
  formatResult,
  attackTweak,
  DIE_SIDES,
} from '../src/dice/DiceRoller.js';

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

test('advantage rolls each d20 twice and keeps the higher die', () => {
  const selection = emptySelection();
  selection.counts.d20 = 1;
  selection.mode = 'advantage';
  const values = [0.2, 0.8]; // 5 then 17
  const result = roll(selection, () => values.shift() ?? 0);
  assert.deepEqual(result.results[0].rolls, [17]);
  assert.deepEqual(result.results[0].dropped, [5]);
  assert.equal(result.total, 17);
});

test('disadvantage keeps the lower die; other die types roll once', () => {
  const selection = emptySelection();
  selection.counts.d20 = 1;
  selection.counts.d6 = 1;
  selection.mode = 'disadvantage';
  const values = [0.5, 0.8, 0.2]; // d6 rolls 4; d20 rolls 17 then 5
  const result = roll(selection, () => values.shift() ?? 0);
  const d20 = result.results.find((r) => r.die === 'd20');
  const d6 = result.results.find((r) => r.die === 'd6');
  assert.deepEqual(d20?.rolls, [5]);
  assert.deepEqual(d20?.dropped, [17]);
  assert.deepEqual(d6?.rolls, [4]);
  assert.equal(d6?.dropped, undefined);
  assert.equal(values.length, 0, 'exactly three rng draws');
});

test('normal mode leaves dropped unset', () => {
  const selection = emptySelection();
  selection.counts.d20 = 2;
  const result = roll(selection, () => 0.5);
  assert.equal(result.results[0].rolls.length, 2);
  assert.equal(result.results[0].dropped, undefined);
});

test('formatResult names the mode and the discarded d20', () => {
  const selection = emptySelection();
  selection.counts.d20 = 1;
  selection.modifier = 2;
  selection.mode = 'advantage';
  const values = [0.2, 0.8];
  const result = roll(selection, () => values.shift() ?? 0);
  assert.equal(formatResult(result), 'd20[17]=17 + modifier=2 -> total: 19 (advantage, dropped 5)');
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
  assert.equal(result.detail, '8 slashing [4,4] + 3 fire [3]');
});

test('rollDamage detail shows the folded modifier on the first group only', () => {
  const result = rollDamage(
    [
      { count: 2, sides: 6, damageType: 'slashing' },
      { count: 1, sides: 4, damageType: 'fire' },
    ],
    3,
    () => 0.5,
  );
  assert.equal(result.detail, '11 slashing [4,4 +3] + 3 fire [3]');

  const negative = rollDamage([{ count: 1, sides: 6, damageType: 'piercing' }], -2, () => 0.5);
  assert.equal(negative.detail, '2 piercing [4 -2]');
});

test('rollDamage folds the modifier into the first term, never below zero', () => {
  const boosted = rollDamage([{ count: 1, sides: 6, damageType: 'piercing' }], 3, () => 0.5);
  assert.equal(boosted.byType[0].subtotal, 7);
  assert.equal(boosted.total, 7);

  const floored = rollDamage([{ count: 1, sides: 6, damageType: 'piercing' }], -10, () => 0.5);
  assert.equal(floored.byType[0].subtotal, 0);
  assert.equal(floored.total, 0);
});

test('attackTweak with bonus dice returns them as counts, unrolled', () => {
  const tweak = attackTweak(1, 'd4', 0, () => {
    throw new Error('bonus dice must not roll here');
  });
  assert.deepEqual(tweak.counts, { d4: 1 });
  assert.equal(tweak.modifier, 0);
  assert.equal(tweak.note, '+1d4');
});

test('attackTweak rolls penalty dice and folds them into the modifier', () => {
  const tweak = attackTweak(-2, 'd4', 0, () => 0.5);
  assert.deepEqual(tweak.counts, {});
  assert.equal(tweak.modifier, -6);
  assert.equal(tweak.note, '-2d4 [3,3]');
});

test('attackTweak carries the flat bonus and notes it, signed', () => {
  const boosted = attackTweak(1, 'd6', 2, () => 0.5);
  assert.equal(boosted.modifier, 2);
  assert.equal(boosted.note, '+1d6 +2');

  const penalty = attackTweak(0, 'd4', -1, () => 0.5);
  assert.deepEqual(penalty.counts, {});
  assert.equal(penalty.modifier, -1);
  assert.equal(penalty.note, '-1');
});

test('attackTweak with nothing to apply is a no-op with an empty note', () => {
  const tweak = attackTweak(0, 'd4', 0, () => 0.5);
  assert.deepEqual(tweak.counts, {});
  assert.equal(tweak.modifier, 0);
  assert.equal(tweak.note, '');
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
