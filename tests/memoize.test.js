import test from 'node:test';
import assert from 'node:assert/strict';
import { memoizeByIdentity } from '../src/util/memoize.js';

test('memoizeByIdentity computes once per argument object', () => {
  let calls = 0;
  const size = memoizeByIdentity((/** @type {{ n: number }} */ input) => {
    calls += 1;
    return input.n * 2;
  });
  const a = { n: 3 };
  const b = { n: 3 };
  assert.equal(size(a), 6);
  assert.equal(size(a), 6);
  assert.equal(calls, 1, 'the same object is computed once');
  assert.equal(size(b), 6);
  assert.equal(calls, 2, 'an equal but distinct object is its own entry');
});

test('memoizeByIdentity caches a falsy result', () => {
  let calls = 0;
  const zero = memoizeByIdentity(() => {
    calls += 1;
    return 0;
  });
  const key = {};
  zero(key);
  zero(key);
  assert.equal(calls, 1);
});
