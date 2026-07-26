import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RACE_LIST,
  getRace,
  withRace,
  withCustomRace,
  resolveRace,
} from '../src/entities/Races.js';
import { createCharacter, withDefaults } from '../src/entities/Character.js';

test('getRace resolves known ids and rejects unknown or absent ones', () => {
  assert.equal(getRace('dwarf')?.name, 'Dwarf');
  assert.equal(getRace('modron'), null);
  assert.equal(getRace(undefined), null);
  assert.equal(getRace(null), null);
  assert.equal(getRace(''), null);
});

test('withRace assigns name, id, and a snapshot of the definition', () => {
  const c = withRace(createCharacter('c1', 'Durnan'), 'dwarf');
  assert.equal(c.race, 'Dwarf');
  assert.equal(c.raceId, 'dwarf');
  assert.equal(c.raceTraits?.speed, 25);
  assert.deepEqual(c.raceTraits?.abilityIncreases, { CON: 2, WIS: 1 });
  assert.deepEqual(c.raceTraits?.resistances, ['poison']);
});

test('withRace snapshot shares nothing with the catalog definition', () => {
  const c = withRace(createCharacter('c1', 'Durnan'), 'dwarf');
  const def = getRace('dwarf');
  assert.notEqual(c.raceTraits.traits, def.traits);
  assert.notEqual(c.raceTraits.abilityIncreases, def.abilityIncreases);
  c.raceTraits.traits.push('mutated');
  assert.ok(!def.traits.includes('mutated'));
});

test('withRace with an unknown id leaves the character unchanged', () => {
  const c = createCharacter('c1', 'Durnan');
  assert.equal(withRace(c, 'modron'), c);
});

test('withCustomRace keeps the hand-typed string and drops catalog fields', () => {
  const picked = withRace(createCharacter('c1', 'Durnan'), 'elf');
  const c = withCustomRace(picked, 'Githzerai');
  assert.equal(c.race, 'Githzerai');
  assert.equal(c.raceId, undefined);
  assert.equal(c.raceTraits, undefined);
});

test('resolveRace prefers the live catalog over the stored snapshot', () => {
  const c = withRace(createCharacter('c1', 'Durnan'), 'halfling');
  const stale = { ...c, raceTraits: { ...c.raceTraits, speed: 99 } };
  assert.equal(resolveRace(stale)?.speed, 25);
});

test('resolveRace falls back to the snapshot when the definition is gone', () => {
  const c = withRace(createCharacter('c1', 'Durnan'), 'gnome');
  const orphaned = { ...c, raceId: 'deleted-custom-race' };
  assert.equal(resolveRace(orphaned)?.speed, 25);
  assert.deepEqual(resolveRace(orphaned)?.languages, ['Common', 'Gnomish']);
});

test('resolveRace is null for a hand-typed race', () => {
  const c = withCustomRace(createCharacter('c1', 'Durnan'), 'Githzerai');
  assert.equal(resolveRace(c), null);
});

test('withDefaults preserves catalog race fields on a round-trip', () => {
  const c = withRace(createCharacter('c1', 'Durnan'), 'tiefling');
  const loaded = withDefaults(JSON.parse(JSON.stringify(c)));
  assert.equal(loaded.raceId, 'tiefling');
  assert.equal(loaded.race, 'Tiefling');
  assert.deepEqual(loaded.raceTraits.resistances, ['fire']);
});

test('every catalog race can be assigned and resolved', () => {
  for (const def of RACE_LIST) {
    const c = withRace(createCharacter('c1', 'X'), def.id);
    assert.equal(c.raceId, def.id, def.id);
    assert.equal(resolveRace(c)?.speed, def.speed, def.id);
  }
});
