import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clamp, clampInt } from '../src/util/num.js';

test('clamp holds a value inside both bounds and leaves precision alone', () => {
  assert.equal(clamp(5, 1, 10), 5);
  assert.equal(clamp(-3, 1, 10), 1);
  assert.equal(clamp(42, 1, 10), 10);
  assert.equal(clamp(2.5, 1, 10), 2.5);
});

test('clamp treats a missing bound as unbounded', () => {
  assert.equal(clamp(-99, 0), 0);
  assert.equal(clamp(-99, undefined, 0), -99);
  assert.equal(clamp(1e9), 1e9);
});

test('clampInt floors and clamps a numeric string', () => {
  assert.equal(clampInt('7.9', 1, 10), 7);
  assert.equal(clampInt('11', 1, 10), 10);
  assert.equal(clampInt(-4, 0, 9), 0);
});

test('clampInt falls back to its minimum when the value does not parse', () => {
  assert.equal(clampInt('', 1), 1);
  assert.equal(clampInt('abc', 1), 1);
  assert.equal(clampInt(undefined, 1), 1);
  assert.equal(clampInt(null, 1), 1);
  assert.equal(clampInt(NaN, 1), 1);
});

test('clampInt falls back to 0 when it has no finite minimum', () => {
  assert.equal(clampInt('nope'), 0);
  assert.equal(clampInt('', undefined, 100), 0);
});

test('clampInt takes an explicit fallback and clamps that too', () => {
  assert.equal(clampInt('', 1, Infinity, 10), 10);
  assert.equal(clampInt('', 1, 5, 10), 5);
});

test('clampInt reads a zero as its fallback, matching the fields it replaced', () => {
  assert.equal(clampInt('0', 1), 1);
  assert.equal(clampInt('0', 0), 0);
  assert.equal(clampInt(0, -Infinity, Infinity, 7), 7);
});
