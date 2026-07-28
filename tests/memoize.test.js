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

test('memoizeByIdentity recomputes when the key object is replaced', () => {
  let calls = 0;
  const label = memoizeByIdentity((/** @type {{ tiles: string[] }} */ input) => {
    calls += 1;
    return input.tiles.join(',');
  });
  let node = { tiles: ['a'] };
  assert.equal(label(node), 'a');
  // An immutable writer hands back a new object rather than mutating, which is
  // what invalidates the entry.
  node = { ...node, tiles: [...node.tiles, 'b'] };
  assert.equal(label(node), 'a,b');
  assert.equal(calls, 2);
  assert.equal(label(node), 'a,b');
  assert.equal(calls, 2, 'the replacement is cached in its turn');
});

test('memoizeByIdentity keeps two memoized functions independent', () => {
  const key = { n: 2 };
  const double = memoizeByIdentity((/** @type {{ n: number }} */ i) => i.n * 2);
  const triple = memoizeByIdentity((/** @type {{ n: number }} */ i) => i.n * 3);
  assert.equal(double(key), 4);
  assert.equal(triple(key), 6);
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
