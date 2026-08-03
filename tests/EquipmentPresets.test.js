import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GEAR_PRESETS, enemyArmor, copyEnemyWeapon } from '../src/entities/EquipmentPresets.js';

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
