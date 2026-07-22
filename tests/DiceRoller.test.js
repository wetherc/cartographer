import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roll, emptySelection, DIE_SIDES } from '../src/dice/DiceRoller.js';

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

test('emptySelection rolls to just the modifier', () => {
  const selection = emptySelection();
  selection.modifier = 5;
  const result = roll(selection, () => 0.5);
  assert.equal(result.total, 5);
  assert.equal(result.results.length, 0);
});
