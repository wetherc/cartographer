import test from 'node:test';
import assert from 'node:assert/strict';

import { packEntities, packEntity, sameValue } from '../src/storage/EntityPack.js';

/** A stand-in entity unpacker with a constant default per field. */
function withConstantDefaults(entity) {
  return {
    ...entity,
    name: entity.name ?? '',
    tags: entity.tags ?? [],
    location: entity.location ?? null,
    count: entity.count ?? 0,
  };
}

test('sameValue compares structurally and ignores key order', () => {
  assert.equal(sameValue({ a: 1, b: [2, { c: null }] }, { b: [2, { c: null }], a: 1 }), true);
  assert.equal(sameValue({ a: 1 }, { a: 1, b: undefined }), false, 'an extra key is a difference');
  assert.equal(sameValue([1, 2], [1, 2, 3]), false);
  assert.equal(sameValue([1, 2], { 0: 1, 1: 2 }), false, 'an array is not a record');
  assert.equal(sameValue(0, '0'), false);
  assert.equal(sameValue(null, {}), false);
});

test('a field the unpacker restores is dropped, one it does not is kept', () => {
  const packed = packEntity(
    { id: 'a', name: '', tags: [], location: null, count: 3 },
    withConstantDefaults,
  );
  assert.deepEqual(packed, { id: 'a', count: 3 });
});

test('a field holding a non-default value survives', () => {
  const entity = { id: 'a', name: 'Rook', tags: ['seen'], location: 'world', count: 0 };
  assert.deepEqual(packEntity(entity, withConstantDefaults), {
    id: 'a',
    name: 'Rook',
    tags: ['seen'],
    location: 'world',
  });
});

test('a derived default is packed against the entity, not against a type-wide one', () => {
  // The hazard a table of per-type defaults cannot see: the default depends on
  // another field of the same entity, so what a level-1 entry may omit a level-7
  // one must keep.
  const withDerivedGear = (entity) => ({
    ...entity,
    level: entity.level ?? 1,
    weapon: entity.weapon ?? ((entity.level ?? 1) > 5 ? 'greataxe' : 'club'),
  });
  const low = packEntity({ id: 'a', level: 1, weapon: 'club' }, withDerivedGear);
  assert.equal('weapon' in low, false, 'the level-1 default is restorable, so it goes');
  const high = packEntity({ id: 'b', level: 7, weapon: 'club' }, withDerivedGear);
  assert.equal(
    high.weapon,
    'club',
    'a level-7 entry keeps the same value, since its default differs',
  );
  assert.equal(high.level, 7);
  for (const packed of [low, high]) {
    const original =
      packed.id === 'a'
        ? { id: 'a', level: 1, weapon: 'club' }
        : { id: 'b', level: 7, weapon: 'club' };
    assert.deepEqual(withDerivedGear(packed), withDerivedGear(original), 'both round-trip');
  }
});

test('packing targets what the unpacker produces, not the input', () => {
  // A `withDefaults` that rewrites its input (a migration, in practice) still
  // round-trips: the comparison target is the loaded shape, which is what a save
  // has to reproduce.
  const withMigration = ({ legacy, ...rest }) => ({
    ...rest,
    kind: rest.kind ?? legacy ?? 'none',
    tags: rest.tags ?? [],
  });
  const packed = packEntity({ id: 'a', legacy: 'rogue', tags: [] }, withMigration);
  assert.deepEqual(packed, { id: 'a', kind: 'rogue' });
  assert.deepEqual(withMigration(packed), withMigration({ id: 'a', legacy: 'rogue', tags: [] }));
});

test('a field the unpacker cannot restore is never dropped, however empty', () => {
  const passthrough = (entity) => ({ ...entity });
  assert.deepEqual(packEntity({ id: 'a', notes: '', hits: 0 }, passthrough), {
    id: 'a',
    notes: '',
    hits: 0,
  });
});

test('packing a collection leaves non-record entries alone', () => {
  const packed = packEntities([{ id: 'a', tags: [] }, null, 7, ['x']], withConstantDefaults);
  assert.deepEqual(packed, [{ id: 'a' }, null, 7, ['x']]);
});
