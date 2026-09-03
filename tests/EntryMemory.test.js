import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  entryFor,
  forgetCharacterEntries,
  forgetEntries,
  PARTY_TRAVELER,
  pruneEntries,
  rememberEntry,
  travelerFor,
} from '../src/map/EntryMemory.js';

const HERO = 'c:hero';

test('travelerFor names the party for the party itself', () => {
  assert.equal(travelerFor(null), PARTY_TRAVELER);
});

test('travelerFor names the party for a character standing with it', () => {
  assert.equal(travelerFor({ id: 'hero' }), PARTY_TRAVELER);
  assert.equal(travelerFor({ id: 'hero', location: null }), PARTY_TRAVELER);
});

test('travelerFor names a character who holds their own location', () => {
  assert.equal(travelerFor({ id: 'hero', location: { nodeId: 'cave', tileId: '1,1' } }), HERO);
});

test('travelerFor keeps a character named party apart from the party', () => {
  const key = travelerFor({ id: 'party', location: { nodeId: 'cave', tileId: '1,1' } });
  assert.notEqual(key, PARTY_TRAVELER);
});

test('entryFor reads the tile one traveler entered a child through', () => {
  const memory = { party: { cave: '4,7' }, [HERO]: { cave: '9,2' } };
  assert.equal(entryFor(memory, PARTY_TRAVELER, 'cave'), '4,7');
  assert.equal(entryFor(memory, HERO, 'cave'), '9,2');
});

test('entryFor reports null for a traveler or child with no entry', () => {
  const memory = { party: { cave: '4,7' } };
  assert.equal(entryFor(memory, PARTY_TRAVELER, 'crypt'), null);
  assert.equal(entryFor(memory, HERO, 'cave'), null);
  assert.equal(entryFor({}, PARTY_TRAVELER, 'cave'), null);
});

test('entryFor ignores an inherited property', () => {
  // A save can carry a traveler key that names something on Object's prototype.
  assert.equal(entryFor(/** @type {any} */ ({}), 'toString', 'cave'), null);
});

test('rememberEntry records one traveler without touching the other', () => {
  const memory = rememberEntry({ party: { cave: '4,7' } }, HERO, 'cave', '9,2');
  assert.deepEqual(memory, { party: { cave: '4,7' }, [HERO]: { cave: '9,2' } });
});

test('rememberEntry keeps the other children of the same traveler', () => {
  const memory = rememberEntry({ party: { crypt: '1,1' } }, PARTY_TRAVELER, 'cave', '4,7');
  assert.deepEqual(memory, { party: { crypt: '1,1', cave: '4,7' } });
});

test('rememberEntry replaces an earlier entry for the same traveler and child', () => {
  const memory = rememberEntry({ party: { cave: '4,7' } }, PARTY_TRAVELER, 'cave', '9,2');
  assert.deepEqual(memory, { party: { cave: '9,2' } });
});

test('rememberEntry returns the same memory when the entry already says this', () => {
  const before = { party: { cave: '4,7' } };
  assert.equal(rememberEntry(before, PARTY_TRAVELER, 'cave', '4,7'), before);
});

test('forgetEntries drops the named children for every traveler', () => {
  const memory = forgetEntries({ party: { cave: '4,7', crypt: '1,1' }, [HERO]: { cave: '9,2' } }, [
    'cave',
  ]);
  assert.deepEqual(memory, { party: { crypt: '1,1' } });
});

test('forgetEntries takes a Set, which is what a delete holds', () => {
  const memory = forgetEntries({ party: { cave: '4,7', crypt: '1,1' } }, new Set(['crypt']));
  assert.deepEqual(memory, { party: { cave: '4,7' } });
});

test('forgetEntries returns the same memory when it holds none of them', () => {
  const before = { party: { cave: '4,7' } };
  assert.equal(forgetEntries(before, ['crypt', 'shop']), before);
  assert.equal(forgetEntries(before, []), before);
});

test('forgetCharacterEntries keeps the party alone', () => {
  const memory = forgetCharacterEntries({ party: { cave: '4,7' }, [HERO]: { cave: '9,2' } });
  assert.deepEqual(memory, { party: { cave: '4,7' } });
});

test('forgetCharacterEntries on a memory with no party reads as empty', () => {
  assert.deepEqual(forgetCharacterEntries({ [HERO]: { cave: '9,2' } }), {});
});

test('forgetCharacterEntries returns the same memory when no character holds one', () => {
  const before = { party: { cave: '4,7' } };
  assert.equal(forgetCharacterEntries(before), before);
  const empty = {};
  assert.equal(forgetCharacterEntries(empty), empty);
});

test('pruneEntries drops the entries for nodes that are gone', () => {
  const live = new Set(['cave']);
  const memory = pruneEntries(
    { party: { cave: '4,7', gone: '1,1' }, [HERO]: { gone: '2,2' } },
    (id) => live.has(id),
  );
  assert.deepEqual(memory, { party: { cave: '4,7' } });
});

test('pruneEntries returns the same memory when every node still exists', () => {
  const before = { party: { cave: '4,7' }, [HERO]: { crypt: '1,1' } };
  assert.equal(
    pruneEntries(before, () => true),
    before,
  );
});
