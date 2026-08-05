import { test } from 'node:test';
import assert from 'node:assert/strict';
import { armorClass, stealthPenalty, unproficientWear } from '../src/entities/Armor.js';
import { EQUIPMENT_SLOTS, SHIELD_AC, equip } from '../src/entities/Equipment.js';
import { createCharacter, addItem } from '../src/entities/Character.js';
import { withProficiencies } from '../src/entities/Proficiencies.js';
import { item } from './helpers/fixtures.js';

test('unarmored AC is the character base AC + full DEX modifier', () => {
  const hero = createCharacter('c1', 'Hero', { DEX: 14 }); // +2
  assert.equal(armorClass(hero), 12, '10 + DEX mod by default');
  assert.equal(armorClass({ ...hero, baseAC: 13 }), 15, 'Mage Armor-style base AC raise');
});

test('body armor replaces the baseline; its weight class fixes the DEX scaling', () => {
  /** @param {import('../src/types/entities.js').ArmorWeight} weight @param {number} baseAC @param {number} dex */
  const acFor = (weight, baseAC, dex) => {
    let hero = createCharacter('c1', 'Hero', { DEX: dex });
    hero = addItem(hero, item('suit', 'Suit', { type: 'armor', armorWeight: weight, baseAC }));
    assert.equal(
      armorClass(hero),
      10 + Math.floor((dex - 10) / 2),
      'carrying armor does nothing until equipped',
    );
    return armorClass(equip(hero, 'chest', 'suit'));
  };
  assert.equal(acFor('light', 12, 18), 16, 'light: base + full DEX (+4)');
  assert.equal(acFor('medium', 14, 18), 16, 'medium: DEX capped at +2');
  assert.equal(acFor('heavy', 16, 18), 16, 'heavy: DEX ignored');
  assert.equal(acFor('heavy', 16, 6), 16, 'heavy: negative DEX does not hurt either');
  assert.equal(acFor('medium', 14, 8), 13, 'medium still takes a negative DEX mod');
  assert.equal(
    armorClass({ ...createCharacter('c0', 'Mage'), baseAC: 15 }),
    15,
    'character base AC applies only while unarmored',
  );
});

test('a shield grants its own bonus, and the 5e +2 when it stores none', () => {
  assert.equal(SHIELD_AC, 2);
  /** @param {Record<string, unknown>} fields */
  const acWith = (fields) => {
    let hero = createCharacter('c1', 'Hero'); // DEX 10, AC 10
    hero = addItem(hero, item('shield', 'Shield', { type: 'shield', ...fields }));
    return armorClass(equip(hero, 'offHand', 'shield'));
  };
  assert.equal(acWith({}), 12, 'no stored bonus reads as the standard +2');
  assert.equal(acWith({ acBonus: 3 }), 13, 'a tower shield adds what it stores');
  assert.equal(acWith({ acBonus: 9 }), 19, 'no ceiling: the item is what the GM built');
});

/**
 * A character of one class, with the given ability scores.
 * @param {string} classId
 * @param {Record<string, number>} [stats]
 * @returns {import('../src/types/entities.js').Character}
 */
function classed(classId, stats) {
  const hero = createCharacter('c1', 'Hero', stats);
  return { ...hero, classes: [{ classId, level: 3 }] };
}

test('unarmored defense uses the class ability and only beats the plain result', () => {
  assert.equal(armorClass(classed('barbarian', { DEX: 14, CON: 16 })), 15, '10 + 2 DEX + 3 CON');
  assert.equal(armorClass(classed('monk', { DEX: 14, WIS: 16 })), 15, '10 + 2 DEX + 3 WIS');
  assert.equal(
    armorClass(classed('barbarian', { DEX: 14, CON: 8 })),
    12,
    'a negative CON never drops the AC below the plain 10 + DEX',
  );
  assert.equal(
    armorClass(classed('fighter', { DEX: 14, CON: 16 })),
    12,
    'a class without the feature stays on 10 + DEX',
  );
  assert.equal(
    armorClass({ ...classed('barbarian', { DEX: 14, CON: 16 }), baseAC: 17 }),
    19,
    'a raised base AC wins when it is higher than the formula',
  );
  assert.equal(
    armorClass({ ...classed('barbarian', { DEX: 14, CON: 16 }), baseAC: 6 }),
    8,
    'a GM debuff below 10 stands: the formula does not undo it',
  );
});

test('unarmored defense stacks across two granting classes, taking the best', () => {
  const hero = createCharacter('c1', 'Hero', { DEX: 12, CON: 14, WIS: 18 });
  const both = {
    ...hero,
    classes: [
      { classId: 'barbarian', level: 1 },
      { classId: 'monk', level: 2 },
    ],
  };
  assert.equal(armorClass(both), 15, '10 + 1 DEX + 4 WIS beats the +2 CON version');
});

test('unarmored defense turns off for worn body armor, and for a Monk with a shield', () => {
  /**
   * @param {string} classId
   * @param {Record<string, unknown>} fields
   * @param {import('../src/types/entities.js').EquipmentSlot} slot
   */
  const acWearing = (classId, fields, slot) => {
    let hero = classed(classId, { DEX: 14, CON: 16, WIS: 16 });
    hero = addItem(hero, item('worn', 'Worn', fields));
    return armorClass(equip(hero, slot, 'worn'));
  };
  const armor = { type: 'armor', armorWeight: 'medium', baseAC: 14 };
  assert.equal(acWearing('barbarian', armor, 'chest'), 16, 'body armor replaces the formula');
  assert.equal(
    acWearing('monk', { type: 'shield' }, 'offHand'),
    14,
    'a Monk loses the formula to a shield but keeps the +2: 10 + 2 DEX + 2',
  );
  assert.equal(
    acWearing('barbarian', { type: 'shield' }, 'offHand'),
    17,
    'a Barbarian keeps both: 10 + 2 DEX + 3 CON + 2',
  );
  assert.equal(
    acWearing('barbarian', { type: 'armor', armorWeight: 'light' }, 'chest'),
    12,
    'a chest item with no base AC is still something worn, so the formula is off',
  );
});

test('stealthPenalty names the worn armor, and only while it is worn', () => {
  let hero = createCharacter('c1', 'Hero');
  hero = addItem(
    hero,
    item('p', 'Plate', { type: 'armor', baseAC: 18, stealthDisadvantage: true }),
  );
  hero = addItem(hero, item('l', 'Leather', { type: 'armor', baseAC: 11 }));
  assert.equal(stealthPenalty(hero), null, 'carried armor is quiet');
  assert.equal(stealthPenalty(equip(hero, 'chest', 'p')), 'Plate');
  assert.equal(stealthPenalty(equip(hero, 'chest', 'l')), null);
});

test('armorClass defaults a missing DEX score to 10 (no modifier)', () => {
  const hero = createCharacter('c1', 'Hero');
  const noDex = /** @type {any} */ ({ ...hero, stats: { STR: 12 } });
  assert.equal(armorClass(noDex), 10, '10 base + DEX mod of a defaulted 10 (=0)');
});

test('armorClass reads an unknown armor weight as light (full DEX)', () => {
  let hero = createCharacter('c1', 'Hero', { DEX: 18 }); // +4
  hero = addItem(
    hero,
    item('weird', 'Voidmail', {
      type: 'armor',
      armorWeight: /** @type {any} */ ('void'),
      baseAC: 12,
    }),
  );
  hero = equip(hero, 'chest', 'weird');
  assert.equal(armorClass(hero), 16, 'unknown weight falls back to light: 12 + full DEX (+4)');
});

test('an unarmored character with no stored base AC falls back to 10', () => {
  const hero = createCharacter('c1', 'Hero', { DEX: 14 }); // +2
  const { baseAC: _base, ...legacy } = hero;
  assert.equal(armorClass(/** @type {any} */ (legacy)), 12, '10 + DEX mod');
});

test('unproficientWear names the worn pieces the character is not trained for', () => {
  let hero = createCharacter('c1', 'Hero');
  hero = addItem(hero, item('plate', 'Plate', { type: 'armor', armorWeight: 'heavy', baseAC: 18 }));
  hero = addItem(hero, item('shield', 'Shield', { type: 'shield' }));
  hero = equip(hero, 'chest', 'plate');
  hero = equip(hero, 'offHand', 'shield');
  assert.deepEqual(unproficientWear(hero), ['heavy armor', 'a shield']);

  const trained = withProficiencies(hero, { armor: ['heavy'] });
  assert.deepEqual(unproficientWear(trained), ['a shield'], 'the weight grant skips the shield');
  const fully = withProficiencies(hero, { armor: ['heavy', 'shield'] });
  assert.deepEqual(unproficientWear(fully), []);
});

test('the off hand is the only slot a shield can reach', () => {
  const slots = EQUIPMENT_SLOTS.filter((s) => s.accepts.includes('shield')).map((s) => s.key);
  assert.deepEqual(slots, ['offHand'], 'unproficientWear reads that one slot for a shield');
});

test('unproficientWear reads bare armor as light and skips untracked gear', () => {
  let hero = createCharacter('c1', 'Hero');
  hero = addItem(hero, item('robe', 'Robe', { type: 'armor', baseAC: 11 }));
  hero = equip(hero, 'chest', 'robe');
  assert.deepEqual(unproficientWear(hero), ['light armor'], 'no weight class reads as light');

  const bare = createCharacter('c2', 'Bare');
  assert.deepEqual(unproficientWear(bare), [], 'nothing worn, nothing to flag');
  const legacy = /** @type {any} */ ({ ...hero, proficiencies: undefined });
  assert.deepEqual(unproficientWear(legacy), [], 'a pre-list character stays unpenalized');
});
