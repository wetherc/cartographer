import { test } from 'node:test';
import assert from 'node:assert/strict';
import { indexById, indexBy } from '../src/util/indexById.js';

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

test('indexBy keys by an arbitrary derived key', () => {
  const items = [
    { name: 'Fireball', v: 1 },
    { name: 'Bless', v: 2 },
  ];
  const map = indexBy(items, (s) => s.name.toLowerCase());
  assert.equal(map.get('fireball').v, 1);
  assert.equal(map.get('bless').v, 2);
});

test('indexBy keeps the last item on a duplicate key', () => {
  const map = indexBy(
    [
      { name: 'X', v: 1 },
      { name: 'x', v: 2 },
    ],
    (s) => s.name.toLowerCase(),
  );
  assert.equal(map.size, 1);
  assert.equal(map.get('x').v, 2);
});
