import { test } from 'node:test';
import assert from 'node:assert/strict';

import { coerceEnemyArmor, enemyArmorDelta, enemyArmorLabel } from '../src/entities/EnemyArmor.js';
import { createCreature, effectiveStatBlock } from '../src/entities/Creature.js';
import { enemyArmor } from '../src/entities/EquipmentPresets.js';

test('each armor weight takes the DEX contribution the 5e rule allows', () => {
  const plate = enemyArmor('Plate');
  const shirt = enemyArmor('Chain Shirt');
  const leather = enemyArmor('Leather Armor');
  // Unarmored AC at DEX 16 is 13, so the delta is the armored AC minus 13.
  assert.equal(enemyArmorDelta(plate, 16), 18 - 13, 'heavy armor ignores DEX');
  assert.equal(enemyArmorDelta(shirt, 16), 13 + 2 - 13, 'medium armor caps DEX at +2');
  assert.equal(enemyArmorDelta(leather, 16), 11 + 3 - 13, 'light armor takes all of DEX');
  assert.equal(enemyArmorDelta(plate, 8), 18 - 9, 'heavy armor ignores a DEX penalty');
  assert.equal(enemyArmorDelta(null, 16), 0);
});

test('a DEX 16 creature in Plate has AC 18, and authored AC above 10 + DEX stays on top', () => {
  const knight = createCreature('k', 'Knight', {
    stats: { DEX: 16 },
    armor: enemyArmor('Plate'),
  });
  assert.equal(effectiveStatBlock(knight).AC, 18);
  const shielded = createCreature('s', 'Guard', {
    stats: { DEX: 16, AC: 15 },
    armor: enemyArmor('Plate'),
  });
  assert.equal(effectiveStatBlock(shielded).AC, 20, 'a +2 over the unarmored 13 stays');
});

test('coerceEnemyArmor reads a flat bonus, a string, and junk', () => {
  assert.equal(coerceEnemyArmor(null), null);
  assert.equal(coerceEnemyArmor([]), null);
  assert.equal(coerceEnemyArmor('Plate'), null);
  assert.deepEqual(coerceEnemyArmor({ name: 'Plate', acBonus: 8 }), {
    name: 'Plate',
    baseAC: 18,
    armorWeight: 'heavy',
  });
  assert.deepEqual(coerceEnemyArmor({ name: 'Bark', acBonus: 2 }), {
    name: 'Bark',
    baseAC: 12,
    armorWeight: 'light',
  });
  assert.deepEqual(coerceEnemyArmor({ baseAC: '15', armorWeight: 'medium' }), {
    name: 'Armor',
    baseAC: 15,
    armorWeight: 'medium',
  });
  assert.deepEqual(coerceEnemyArmor({ name: 'Odd', baseAC: 'sixteen', armorWeight: 'x' }), {
    name: 'Odd',
    baseAC: 10,
    armorWeight: 'light',
  });
});

test('enemyArmorLabel names the base AC and the DEX rule', () => {
  assert.equal(enemyArmorLabel(/** @type {any} */ (enemyArmor('Plate'))), 'Plate (AC 18)');
  assert.equal(
    enemyArmorLabel(/** @type {any} */ (enemyArmor('Chain Shirt'))),
    'Chain Shirt (AC 13 + DEX, max 2)',
  );
  assert.equal(
    enemyArmorLabel(/** @type {any} */ (enemyArmor('Leather Armor'))),
    'Leather Armor (AC 11 + DEX)',
  );
});
