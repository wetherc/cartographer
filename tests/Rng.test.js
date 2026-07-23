import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, randomSeed } from '../src/util/Rng.js';

test('mulberry32 is deterministic: the same seed yields the same sequence', () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  for (let i = 0; i < 20; i++) assert.equal(a(), b());
});

test('mulberry32 sequences differ across seeds', () => {
  const a = mulberry32(1);
  const b = mulberry32(2);
  const seqA = [...Array(5)].map(() => a());
  const seqB = [...Array(5)].map(() => b());
  assert.notDeepEqual(seqA, seqB);
});

test('mulberry32 stays within [0, 1)', () => {
  const rng = mulberry32(7);
  for (let i = 0; i < 1000; i++) {
    const v = rng();
    assert.ok(v >= 0 && v < 1);
  }
});

test('randomSeed yields a non-negative integer sized for a form field', () => {
  for (let i = 0; i < 100; i++) {
    const seed = randomSeed();
    assert.ok(Number.isInteger(seed));
    assert.ok(seed >= 0 && seed < 1e9);
  }
});
