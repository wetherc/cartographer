import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_RANGES,
  WEAPON_KINDS,
  WEAPON_PROPERTIES,
  clampWeaponRange,
  weaponKind,
  hasWeaponProperty,
  attackAbility,
  abilityLabel,
} from '../src/entities/Weapons.js';

const STATS = { STR: 14, DEX: 10 };
const DEXY = { STR: 10, DEX: 16 };

test('weaponKind reads the kind field and defaults to melee', () => {
  assert.equal(weaponKind({ name: 'Bow', kind: 'ranged', damage: [] }), 'ranged');
  assert.equal(weaponKind({ name: 'Club', kind: 'melee', damage: [] }), 'melee');
  assert.equal(weaponKind({ name: 'Bite', damage: [] }), 'melee', 'absent kind is melee');
});

test('hasWeaponProperty reads the properties list', () => {
  const glaive = { name: 'Glaive', kind: 'melee', properties: ['heavy', 'reach'], damage: [] };
  assert.equal(hasWeaponProperty(glaive, 'reach'), true);
  assert.equal(hasWeaponProperty(glaive, 'finesse'), false);
  assert.equal(hasWeaponProperty({ name: 'Bite', damage: [] }, 'reach'), false, 'absent is none');
});

test('attackAbility: a plain melee weapon uses STR whatever the stats', () => {
  const club = { name: 'Club', kind: 'melee', damage: [] };
  assert.equal(attackAbility(club, STATS), 'STR');
  assert.equal(attackAbility(club, DEXY), 'STR', 'no finesse, so DEX never applies');
});

test('attackAbility: a ranged weapon always uses DEX', () => {
  const bow = { name: 'Bow', kind: 'ranged', damage: [] };
  assert.equal(attackAbility(bow, STATS), 'DEX', 'even for a STR-heavy attacker');
});

test('attackAbility: finesse takes the higher of STR and DEX, with STR on a tie', () => {
  const rapier = { name: 'Rapier', kind: 'melee', properties: ['finesse'], damage: [] };
  assert.equal(attackAbility(rapier, STATS), 'STR');
  assert.equal(attackAbility(rapier, DEXY), 'DEX');
  assert.equal(attackAbility(rapier, { STR: 12, DEX: 12 }), 'STR', 'tie goes to STR');
  assert.equal(attackAbility(rapier, {}), 'STR', 'absent scores read as 10');
});

test('abilityLabel names the ability without a roller', () => {
  assert.equal(abilityLabel({ name: 'Club', kind: 'melee', damage: [] }), 'STR');
  assert.equal(abilityLabel({ name: 'Bow', kind: 'ranged', damage: [] }), 'DEX');
  assert.equal(
    abilityLabel({ name: 'Rapier', kind: 'melee', properties: ['finesse'], damage: [] }),
    'STR/DEX',
    'finesse depends on the holder, so the label shows both',
  );
});

test('the kind and property vocabularies carry unique keys and labels', () => {
  const kindKeys = WEAPON_KINDS.map((k) => k.key);
  assert.deepEqual([...new Set(kindKeys)], kindKeys);
  const propertyKeys = WEAPON_PROPERTIES.map((p) => p.key);
  assert.deepEqual([...new Set(propertyKeys)], propertyKeys);
  for (const entry of [...WEAPON_KINDS, ...WEAPON_PROPERTIES]) {
    assert.ok(entry.label.length > 0, entry.key);
  }
});

test('clampWeaponRange floors the feet and holds the long range at or above the normal', () => {
  assert.deepEqual(clampWeaponRange({ normal: 25.9, long: 90.2 }, DEFAULT_RANGES.melee), {
    normal: 25,
    long: 90,
  });
  assert.deepEqual(
    clampWeaponRange({ normal: 100, long: 30 }, DEFAULT_RANGES.ranged),
    { normal: 100, long: 100 },
    'a long range under the normal one reads as the normal one',
  );
  assert.deepEqual(
    clampWeaponRange({ normal: 0, long: -5 }, DEFAULT_RANGES.ranged),
    { normal: 80, long: 320 },
    'a value under one foot falls back',
  );
  assert.deepEqual(clampWeaponRange({}, DEFAULT_RANGES.melee), { normal: 20, long: 60 });
});
