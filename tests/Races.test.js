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

test('withRace adds the definition ability increases to the scores', () => {
  const base = createCharacter('c1', 'Durnan', { CON: 12, WIS: 8 });
  const c = withRace(base, 'dwarf');
  assert.equal(c.stats.CON, 14);
  assert.equal(c.stats.WIS, 9);
  assert.equal(c.stats.STR, base.stats.STR, 'an ability the race skips is untouched');
});

test('withRace applied twice grants the increase once', () => {
  const base = createCharacter('c1', 'Durnan', { CON: 12 });
  assert.equal(withRace(withRace(base, 'dwarf'), 'dwarf').stats.CON, 14);
});

test('withRace swaps one race bonus for the next instead of stacking', () => {
  const base = createCharacter('c1', 'Durnan', { CON: 12, DEX: 10 });
  const swapped = withRace(withRace(base, 'dwarf'), 'elf');
  assert.equal(swapped.stats.CON, 12, "the dwarf's increase comes back off");
  assert.equal(swapped.stats.DEX, 12, "the elf's lands");
});

test('withRace takes back the increases the snapshot recorded, not the catalog ones', () => {
  const base = createCharacter('c1', 'Durnan', { CON: 12, DEX: 10 });
  const dwarf = withRace(base, 'dwarf');
  // A save written before the catalog was edited: the snapshot says +4 CON was
  // applied, so that is what switching races has to undo.
  const stale = {
    ...dwarf,
    stats: { ...dwarf.stats, CON: 16 },
    raceTraits: { ...dwarf.raceTraits, abilityIncreases: { CON: 4 } },
  };
  assert.equal(withRace(stale, 'elf').stats.CON, 12);
});

test('withCustomRace keeps the hand-typed string and drops catalog fields', () => {
  const picked = withRace(createCharacter('c1', 'Durnan', { DEX: 10 }), 'elf');
  const c = withCustomRace(picked, 'Githzerai');
  assert.equal(c.race, 'Githzerai');
  assert.equal(c.raceId, undefined);
  assert.equal(c.raceTraits, undefined);
  assert.equal(c.stats.DEX, 10, "the dropped race's increase goes with it");
});

test('withCustomRace on a character that never had a catalog race keeps the scores', () => {
  const c = withCustomRace(createCharacter('c1', 'Nim', { DEX: 15 }), 'Githzerai');
  assert.equal(c.stats.DEX, 15);
});

test('resolveRace prefers the live catalog over the stored snapshot', () => {
  const c = withRace(createCharacter('c1', 'Durnan'), 'halfling');
  const stale = { ...c, raceTraits: { ...c.raceTraits, speed: 99 } };
  assert.equal(resolveRace(stale)?.speed, 25);
});

test('resolveRace reports the ability increases the character actually got', () => {
  const c = withRace(createCharacter('c1', 'Durnan'), 'halfling');
  // Only the snapshot knows what was added to the scores, so a catalog edit
  // must not show up here as a bonus the character was never granted.
  const edited = { ...c, raceTraits: { ...c.raceTraits, abilityIncreases: { DEX: 1 } } };
  assert.deepEqual(resolveRace(edited)?.abilityIncreases, { DEX: 1 });
  assert.equal(resolveRace(edited)?.speed, 25, 'everything else still comes from the catalog');
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
