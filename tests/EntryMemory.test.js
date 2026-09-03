import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entryFor, forgetEntries, pruneEntries, rememberEntry } from '../src/map/EntryMemory.js';

test('entryFor reads the tile a child was entered through', () => {
  assert.equal(entryFor({ cave: '4,7' }, 'cave'), '4,7');
});

test('entryFor on a child with no entry reports null', () => {
  assert.equal(entryFor({}, 'cave'), null);
  assert.equal(entryFor({ cave: '4,7' }, 'crypt'), null);
});

test('entryFor ignores an inherited property', () => {
  // A save can carry a key that names something on Object's prototype.
  assert.equal(entryFor(/** @type {any} */ ({}), 'toString'), null);
});

test('rememberEntry records the tile', () => {
  const memory = rememberEntry({}, 'cave', '4,7');
  assert.deepEqual(memory, { cave: '4,7' });
});

test('rememberEntry replaces an earlier entry for the same child', () => {
  const memory = rememberEntry({ cave: '4,7' }, 'cave', '9,2');
  assert.deepEqual(memory, { cave: '9,2' });
});

test('rememberEntry keeps the other children', () => {
  const memory = rememberEntry({ crypt: '1,1' }, 'cave', '4,7');
  assert.deepEqual(memory, { crypt: '1,1', cave: '4,7' });
});

test('rememberEntry returns the same memory when the entry already says this', () => {
  const before = { cave: '4,7' };
  assert.equal(rememberEntry(before, 'cave', '4,7'), before);
});

test('forgetEntries drops the named children', () => {
  const memory = forgetEntries({ cave: '4,7', crypt: '1,1', shop: '2,2' }, ['cave', 'shop']);
  assert.deepEqual(memory, { crypt: '1,1' });
});

test('forgetEntries takes a Set, which is what a delete holds', () => {
  const memory = forgetEntries({ cave: '4,7', crypt: '1,1' }, new Set(['crypt']));
  assert.deepEqual(memory, { cave: '4,7' });
});

test('forgetEntries returns the same memory when it holds none of them', () => {
  const before = { cave: '4,7' };
  assert.equal(forgetEntries(before, ['crypt', 'shop']), before);
  assert.equal(forgetEntries(before, []), before);
});

test('forgetEntries ignores an inherited property name', () => {
  const before = { cave: '4,7' };
  assert.equal(forgetEntries(before, ['toString']), before);
});

test('pruneEntries drops the entries for nodes that are gone', () => {
  const live = new Set(['cave']);
  const memory = pruneEntries({ cave: '4,7', gone: '1,1' }, (id) => live.has(id));
  assert.deepEqual(memory, { cave: '4,7' });
});

test('pruneEntries returns the same memory when every node still exists', () => {
  const before = { cave: '4,7', crypt: '1,1' };
  assert.equal(
    pruneEntries(before, () => true),
    before,
  );
});
