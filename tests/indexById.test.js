import { test } from 'node:test';
import assert from 'node:assert/strict';
import { indexById } from '../src/util/indexById.js';

test('indexById maps each item by its id', () => {
  const items = [
    { id: 'a', v: 1 },
    { id: 'b', v: 2 },
  ];
  const map = indexById(items);
  assert.equal(map.size, 2);
  assert.equal(map.get('a').v, 1);
  assert.equal(map.get('b').v, 2);
  assert.equal(map.get('missing'), undefined);
});

test('indexById on an empty list yields an empty map', () => {
  const map = indexById([]);
  assert.equal(map.size, 0);
});

test('indexById keeps the last item on a duplicate id', () => {
  const map = indexById([
    { id: 'a', v: 1 },
    { id: 'a', v: 2 },
  ]);
  assert.equal(map.size, 1);
  assert.equal(map.get('a').v, 2);
});
