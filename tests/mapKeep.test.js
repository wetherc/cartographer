import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapKeep } from '../src/util/mapKeep.js';

test('mapKeep returns the same list when no element changes', () => {
  const list = [{ a: 1 }, { a: 2 }];
  assert.equal(
    mapKeep(list, (x) => x),
    list,
  );
});

test('mapKeep returns a new list when one element changes', () => {
  const list = [{ a: 1 }, { a: 2 }];
  const next = mapKeep(list, (x, i) => (i === 1 ? { a: 3 } : x));
  assert.notEqual(next, list);
  assert.deepEqual(next, [{ a: 1 }, { a: 3 }]);
  assert.equal(next[0], list[0]);
});

test('mapKeep keeps an empty list', () => {
  const list = [];
  assert.equal(
    mapKeep(list, (x) => x),
    list,
  );
});
