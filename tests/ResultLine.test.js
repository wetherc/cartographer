import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptySelection, roll } from '../src/dice/DiceRoller.js';
import { resultSummary } from '../src/dice/ResultLine.js';

test('resultSummary lists the dice and a positive modifier, with no verdict', () => {
  const selection = emptySelection();
  selection.counts.d6 = 2;
  selection.modifier = 3;
  assert.deepEqual(
    resultSummary(
      roll(selection, () => 0.5),
      null,
    ),
    {
      total: 11,
      detail: '2d6 (4, 4) + 3',
      verdict: null,
      passed: null,
    },
  );
});

test('resultSummary signs a negative modifier and reports success and fail', () => {
  const selection = emptySelection();
  selection.counts.d20 = 1;
  selection.modifier = -2;
  const result = roll(selection, () => 0.5);
  assert.equal(resultSummary(result, 9).detail, 'd20 (11) - 2');
  assert.equal(resultSummary(result, 9).verdict, 'vs 9: success');
  assert.equal(resultSummary(result, 10).verdict, 'vs 10: fail');
});

test('resultSummary shows a bare modifier and leaves out a zero modifier', () => {
  const flat = emptySelection();
  flat.modifier = 5;
  assert.equal(
    resultSummary(
      roll(flat, () => 0.5),
      null,
    ).detail,
    '+5',
  );
  const plain = emptySelection();
  plain.counts.d8 = 1;
  assert.equal(
    resultSummary(
      roll(plain, () => 0.5),
      null,
    ).detail,
    'd8 (5)',
  );
});

test('resultSummary names the mode and the dropped d20', () => {
  const selection = emptySelection();
  selection.counts.d20 = 1;
  selection.modifier = 2;
  selection.mode = 'advantage';
  const values = [0.2, 0.8];
  const result = roll(selection, () => values.shift() ?? 0);
  assert.equal(resultSummary(result, null).detail, 'd20 (17) + 2, advantage, dropped 5');
});

test('resultSummary judges an attack roll as hit or miss', () => {
  const selection = emptySelection();
  selection.counts.d20 = 1;
  selection.modifier = 2;
  const at = (/** @type {number} */ face) => roll(selection, () => (face - 1) / 20);
  assert.deepEqual(
    [resultSummary(at(11), 13, {}).verdict, resultSummary(at(11), 13, {}).passed],
    ['vs 13: hit', true],
  );
  assert.equal(resultSummary(at(10), 13, {}).verdict, 'vs 13: miss');
  assert.equal(resultSummary(at(20), 30, {}).verdict, 'vs 30: hit', 'a natural 20 always hits');
  assert.equal(resultSummary(at(19), 30, { critOn: 19 }).verdict, 'vs 30: hit');
  assert.equal(resultSummary(at(1), 2, {}).verdict, 'vs 2: miss', 'a natural 1 always misses');
  assert.equal(resultSummary(at(1), 2).verdict, 'vs 2: success', 'a plain roll has no such rule');
  assert.equal(resultSummary(at(5), null, {}).passed, null);
});

test('resultSummary judges an attack with no d20 by its total', () => {
  const flat = emptySelection();
  flat.modifier = 5;
  assert.equal(
    resultSummary(
      roll(flat, () => 0),
      5,
      {},
    ).verdict,
    'vs 5: hit',
  );
});
