import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  WEAPON_PRESETS,
  ARMOR_PRESETS,
  GEAR_PRESETS,
  CONSUMABLE_PRESETS,
  enemyArmor,
  copyEnemyWeapon,
} from '../src/entities/EquipmentPresets.js';

test('Preset arrays are non-empty arrays', () => {
  assert(
    Array.isArray(WEAPON_PRESETS) && WEAPON_PRESETS.length > 0,
    'WEAPON_PRESETS should be a non-empty array',
  );
  assert(
    Array.isArray(ARMOR_PRESETS) && ARMOR_PRESETS.length > 0,
    'ARMOR_PRESETS should be a non-empty array',
  );
  assert(
    Array.isArray(GEAR_PRESETS) && GEAR_PRESETS.length > 0,
    'GEAR_PRESETS should be a non-empty array',
  );
  assert(
    Array.isArray(CONSUMABLE_PRESETS) && CONSUMABLE_PRESETS.length > 0,
    'CONSUMABLE_PRESETS should be a non-empty array',
  );
});

test('WEAPON_PRESETS have a consistent schema', () => {
  for (const preset of WEAPON_PRESETS) {
    assert.equal(typeof preset.name, 'string');
    assert.ok(['weapon', 'bow'].includes(preset.type), `Invalid type for ${preset.name}`);
    assert.equal(typeof preset.handling, 'string');
    assert(Array.isArray(preset.damage), `Damage for ${preset.name} should be an array`);
  }
});

test('ARMOR_PRESETS have a consistent schema', () => {
  for (const preset of ARMOR_PRESETS) {
    assert.equal(typeof preset.name, 'string');
    assert.ok(
      ['light', 'medium', 'heavy'].includes(preset.armorWeight),
      `Invalid armorWeight for ${preset.name}`,
    );
    assert.equal(typeof preset.baseAC, 'number');
  }
});

test('GEAR_PRESETS have a consistent schema', () => {
  for (const preset of GEAR_PRESETS) {
    assert.equal(typeof preset.name, 'string');
    assert.equal(typeof preset.description, 'string');
  }
});

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

test('CONSUMABLE_PRESETS have a consistent schema', () => {
  for (const preset of CONSUMABLE_PRESETS) {
    assert.equal(typeof preset.name, 'string');
    assert.equal(typeof preset.description, 'string');
  }
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
    handling: 'melee',
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
    name: 'Club',
    handling: 'melee',
  };
  const copied1 = copyEnemyWeapon(weaponWithoutDamage);
  assert.deepEqual(copied1.damage, [], 'Weapon without damage should have an empty damage array');

  const weaponWithoutHandling = {
    name: 'Improvised',
    damage: [{ count: 1, sides: 4, damageType: 'bludgeoning' }],
  };
  const copied2 = copyEnemyWeapon(weaponWithoutHandling);
  assert.equal(copied2.handling, 'melee', 'Weapon without handling should default to "melee"');
});
