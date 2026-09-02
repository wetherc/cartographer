import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GEAR_PRESETS,
  SHIELD_PRESETS,
  enemyArmor,
  copyEnemyWeapon,
  coerceWeapon,
} from '../src/entities/EquipmentPresets.js';
import { SHIELD_AC } from '../src/entities/Equipment.js';
import { hasWeaponProperty } from '../src/entities/Weapons.js';

test('GEAR_PRESETS ship the pouch and the three focus kinds, all flagged', () => {
  const flagged = GEAR_PRESETS.filter((p) => p.spellFocus === true).map((p) => p.name);
  assert.deepEqual(flagged.sort(), [
    'Arcane Focus',
    'Component Pouch',
    'Druidic Focus',
    'Holy Symbol',
  ]);
  assert.equal(
    GEAR_PRESETS.find((p) => p.name === 'Bedroll')?.spellFocus,
    undefined,
    'ordinary gear carries no flag at all, so a saved item stays the shape it was',
  );
});

test('SHIELD_PRESETS ship the 5e shield at the default bonus', () => {
  assert.deepEqual(SHIELD_PRESETS, [{ name: 'Shield', acBonus: SHIELD_AC }]);
});

test('enemyArmor returns correct armor object for valid name', () => {
  const plate = enemyArmor('Plate');
  assert.deepEqual(plate, { name: 'Plate', acBonus: 8 });

  const leather = enemyArmor('Leather Armor');
  assert.deepEqual(leather, { name: 'Leather Armor', acBonus: 1 });
});

test('enemyArmor returns null for invalid or missing name', () => {
  assert.equal(enemyArmor('Bogus Armor'), null);
  assert.equal(enemyArmor(null), null);
  assert.equal(enemyArmor(undefined), null);
  assert.equal(enemyArmor(''), null);
});

test('copyEnemyWeapon creates a deep copy of a weapon', () => {
  const originalWeapon = {
    name: 'Test Sword',
    kind: 'melee',
    category: 'simple',
    properties: [],
    range: null,
    versatileDamage: [],
    damage: [{ count: 1, sides: 8, damageType: 'slashing' }],
  };

  const copiedWeapon = copyEnemyWeapon(originalWeapon);

  assert.deepEqual(copiedWeapon, originalWeapon, 'Copied weapon should have the same values');
  assert.notStrictEqual(copiedWeapon, originalWeapon, 'Copied weapon should be a new object');
  assert.notStrictEqual(
    copiedWeapon.damage,
    originalWeapon.damage,
    'Damage array should be a new array',
  );
  assert.notStrictEqual(
    copiedWeapon.damage[0],
    originalWeapon.damage[0],
    'Damage part should be a new object',
  );
});

test('copyEnemyWeapon handles missing optional fields', () => {
  const weaponWithoutDamage = {
    name: 'Cudgel',
    kind: 'melee',
  };
  const copied1 = copyEnemyWeapon(weaponWithoutDamage);
  assert.deepEqual(copied1.damage, [], 'Weapon without damage should have an empty damage array');

  const weaponWithoutKind = {
    name: 'Improvised',
    damage: [{ count: 1, sides: 4, damageType: 'bludgeoning' }],
  };
  const copied2 = copyEnemyWeapon(weaponWithoutKind);
  assert.equal(copied2.kind, 'melee', 'Weapon without a kind should default to melee');
});

test('copyEnemyWeapon rewrites a legacy handling weapon to the property model', () => {
  const legacy = {
    name: 'Warped Blade',
    handling: 'finesse',
    damage: [{ count: 1, sides: 6, damageType: 'slashing' }],
  };
  const copied = copyEnemyWeapon(legacy);
  assert.deepEqual(copied, {
    name: 'Warped Blade',
    kind: 'melee',
    category: 'simple',
    properties: ['finesse'],
    range: null,
    versatileDamage: [],
    damage: [{ count: 1, sides: 6, damageType: 'slashing' }],
  });
  assert.ok(!('handling' in copied), 'the legacy field does not survive the copy');
});

test('coerceWeapon adopts the preset shape on a name match and keeps edited dice out of it', () => {
  const coerced = coerceWeapon({
    name: 'longsword',
    handling: 'melee',
    damage: [{ count: 2, sides: 8, damageType: 'slashing' }],
  });
  assert.deepEqual(coerced, {
    kind: 'melee',
    category: 'martial',
    properties: ['versatile'],
    range: null,
    versatileDamage: [{ count: 1, sides: 10, damageType: 'slashing' }],
  });
});

test('a customized copy of a preset keeps its own properties across a coerce', () => {
  const edited = {
    name: 'Longsword',
    kind: 'melee',
    category: 'martial',
    properties: ['finesse'],
    damage: [{ count: 1, sides: 8, damageType: 'slashing' }],
  };
  const expected = {
    kind: 'melee',
    category: 'martial',
    properties: ['finesse'],
    range: null,
    versatileDamage: [],
  };
  assert.deepEqual(
    coerceWeapon(edited),
    expected,
    'the preset does not overwrite an edit that shares its name',
  );
  assert.deepEqual(
    coerceWeapon(coerceWeapon(edited)),
    expected,
    'a second pass is a no-op, so repeated loads do not drift',
  );
});

test('coerceWeapon reads a legacy weapon with no handling as a simple one', () => {
  assert.deepEqual(
    coerceWeapon({ name: 'Old Club', damage: [{ count: 1, sides: 4, damageType: 'bludgeoning' }] }),
    { kind: 'melee', category: 'simple', properties: [], range: null, versatileDamage: [] },
    'the field was optional, so its absence still means a legacy weapon',
  );
  assert.deepEqual(
    coerceWeapon({ name: 'Bite', kind: 'melee' }),
    { kind: 'melee', category: null, properties: [], range: null, versatileDamage: [] },
    'a new-shape weapon with no category stays a natural weapon',
  );
});

test('coerceWeapon clamps a stated range and never lets the long one undercut', () => {
  assert.deepEqual(
    coerceWeapon({ name: 'Odd Bow', kind: 'ranged', range: { normal: -30, long: 'far' } }).range,
    { normal: 80, long: 320 },
    'unreadable feet fall back to the default for the kind',
  );
  assert.deepEqual(
    coerceWeapon({ name: 'Odd Bow', kind: 'ranged', range: { normal: 120.7, long: 40 } }).range,
    { normal: 120, long: 120 },
  );
});

test('coerceWeapon maps an unmatched legacy weapon from its handling', () => {
  assert.deepEqual(coerceWeapon({ name: 'Odd Club', handling: 'melee' }), {
    kind: 'melee',
    category: 'simple',
    properties: [],
    range: null,
    versatileDamage: [],
  });
  assert.deepEqual(coerceWeapon({ name: 'Odd Sling', handling: 'ranged' }), {
    kind: 'ranged',
    category: 'simple',
    properties: [],
    range: { normal: 80, long: 320 },
    versatileDamage: [],
  });
});

test('coerceWeapon keeps a new-shape weapon and filters unknown properties', () => {
  const coerced = coerceWeapon({
    name: 'Chitin Claw',
    kind: 'melee',
    properties: ['reach', 'spiky'],
    versatileDamage: [{ count: 1, sides: 8, damageType: 'slashing' }],
  });
  assert.deepEqual(coerced, {
    kind: 'melee',
    category: null,
    properties: ['reach'],
    range: null,
    versatileDamage: [{ count: 1, sides: 8, damageType: 'slashing' }],
  });
});

test('coerceWeapon emits every field, so a spread of the raw record cannot keep a bad one', () => {
  const raw = {
    name: 'Odd Blade',
    kind: 'melee',
    category: 'legendary',
    properties: { a: 1 },
    range: 'far',
    versatileDamage: 'lots',
  };
  const merged = { ...raw, ...coerceWeapon(raw) };
  assert.deepEqual(merged, {
    name: 'Odd Blade',
    kind: 'melee',
    category: null,
    properties: [],
    range: null,
    versatileDamage: [],
  });
  assert.equal(hasWeaponProperty(merged, 'finesse'), false, 'the property check reads a list');
});
