import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hpAmount } from '../src/view/HpAmount.js';

test('hpAmount reads a whole number of 1 or more', () => {
  assert.equal(hpAmount('7'), 7);
  assert.equal(hpAmount(' 12 '), 12);
  assert.equal(hpAmount('2.9'), 2);
  assert.equal(hpAmount(5), 5);
});

test('hpAmount reads an unusable entry as null', () => {
  for (const raw of ['', '0', '-3', '0.5', 'abc', '3abc', null, undefined, 'Infinity']) {
    assert.equal(hpAmount(raw), null, String(raw));
  }
});
