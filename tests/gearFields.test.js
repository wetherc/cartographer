import { test } from 'node:test';
import assert from 'node:assert/strict';

import { gearOptions, readGear } from '../src/app/gearFields.js';

test('readGear defaults a preset missing handling and damage', () => {
  const options = {
    weaponChoices: [{ name: 'Stick' }],
    armorChoices: [],
    currentWeapon: null,
    currentArmor: null,
  };
  const { weapon } = readGear('Stick', '', /** @type {any} */ (options));
  assert.equal(weapon.name, 'Stick');
  assert.equal(weapon.handling, 'melee', 'a preset with no handling defaults to melee');
  assert.deepEqual(weapon.damage, [], 'a preset with no damage list reads empty');
});

test('gearOptions leads both pickers with None and lists the library gear', () => {
  const { weaponOptions, armorOptions } = gearOptions(null);
  assert.equal(weaponOptions[0].value, '');
  assert.equal(weaponOptions[0].label, 'None (unarmed)');
  assert.equal(armorOptions[0].value, '');
  assert.equal(armorOptions[0].label, 'None (unarmored)');
  assert.ok(weaponOptions.some((o) => o.value === 'Shortsword'));
  assert.ok(armorOptions.some((o) => o.label.includes('AC')));
});

test('gearOptions keeps a hand-tuned non-library entry offered, labelled with its numbers', () => {
  const current = {
    weapon: {
      name: 'Rusty Cleaver',
      handling: 'melee',
      damage: [{ count: 2, sides: 4, type: 'slashing' }],
    },
    armor: { name: 'Bone Plate', acBonus: 3 },
  };
  const { weaponOptions, armorOptions } = gearOptions(current);
  const weapon = weaponOptions.find((o) => o.value === 'Rusty Cleaver');
  assert.ok(weapon, 'custom weapon stays offered');
  assert.ok(weapon.label.includes('2d4'), 'labelled with its damage');
  const armor = armorOptions.find((o) => o.value === 'Bone Plate');
  assert.ok(armor, 'custom armor stays offered');
  assert.ok(armor.label.includes('+3 AC'));
});

test('gearOptions omits the custom rows when the current gear is a library entry', () => {
  const options = gearOptions({
    weapon: { name: 'Shortsword', handling: 'melee', damage: [] },
    armor: null,
  });
  const matches = options.weaponOptions.filter((o) => o.value === 'Shortsword');
  assert.equal(matches.length, 1, 'the library row is not duplicated');
});

test('readGear stores null for the explicit None choice', () => {
  const options = gearOptions(null);
  const { weapon, armor } = readGear('', '', options);
  assert.equal(weapon, null);
  assert.equal(armor, null);
});

test('readGear copies a library preset with its damage cloned', () => {
  const options = gearOptions(null);
  const { weapon } = readGear('Shortsword', '', options);
  assert.equal(weapon.name, 'Shortsword');
  assert.ok(Array.isArray(weapon.damage));
  const preset = options.weaponChoices.find((p) => p.name === 'Shortsword');
  assert.notEqual(weapon.damage[0], preset.damage[0], 'damage parts are copies, not shared');
});

test('readGear falls back to the current hand-tuned entry', () => {
  const current = {
    weapon: { name: 'Rusty Cleaver', handling: 'melee', damage: [] },
    armor: { name: 'Bone Plate', acBonus: 3 },
  };
  const options = gearOptions(current);
  const kept = readGear('Rusty Cleaver', 'Bone Plate', options);
  assert.equal(kept.weapon, current.weapon);
  assert.equal(kept.armor, current.armor);

  const bare = readGear('Unknown Blade', 'Unknown Mail', gearOptions(null));
  assert.equal(bare.weapon, null, 'no current entry reads as unarmed');
  assert.equal(bare.armor, null);
});
