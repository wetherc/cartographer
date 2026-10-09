import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EQUIPMENT_SLOTS, equip } from '../src/entities/Equipment.js';
import { createCharacter, addItem } from '../src/entities/Character.js';
import { slotChoices, slotStat, pickerDetail } from '../src/view/EquipSlots.js';
import { item } from './helpers/fixtures.js';

const slot = (/** @type {string} */ key) => EQUIPMENT_SLOTS.find((s) => s.key === key);

function kit() {
  let hero = createCharacter('c1', 'Hero');
  hero = addItem(
    hero,
    item('sword', 'Longsword', {
      type: 'weapon',
      damage: [{ count: 1, sides: 8, damageType: 'slashing' }],
    }),
  );
  hero = addItem(hero, item('gs', 'Greatsword', { type: 'weapon', properties: ['two-handed'] }));
  hero = addItem(hero, item('shield', 'Shield', { type: 'shield' }));
  hero = addItem(hero, item('potion', 'Potion', { type: 'consumable' }));
  return hero;
}

test('the off hand lists shields before weapons and leaves out potions', () => {
  const choices = slotChoices(kit(), slot('offHand'));
  assert.deepEqual(
    choices.items.map((i) => i.id),
    ['shield', 'gs', 'sword'],
  );
  assert.equal(choices.equipped, null);
  assert.equal(choices.bothHands, null);
});

test('a two-handed weapon in the main hand names itself in the empty off hand', () => {
  const hero = equip(kit(), 'mainHand', 'gs');
  const choices = slotChoices(hero, slot('offHand'));
  assert.equal(choices.bothHands, 'Greatsword');
  assert.equal(slotChoices(hero, slot('mainHand')).equipped?.id, 'gs');
});

test('the item a slot holds stays in its list', () => {
  const hero = equip(kit(), 'mainHand', 'sword');
  const ids = slotChoices(hero, slot('mainHand')).items.map((i) => i.id);
  assert.ok(ids.includes('sword'));
  assert.ok(!slotChoices(hero, slot('offHand')).items.some((i) => i.id === 'sword'));
});

test('the slot stat line is short', () => {
  assert.equal(
    slotStat(
      item('a', 'Splint', { type: 'armor', baseAC: 17, armorWeight: 'heavy', strength: 15 }),
    ),
    'AC 17, heavy',
  );
  assert.equal(slotStat(item('l', 'Leather', { type: 'armor', baseAC: 11 })), 'AC 11, light');
  assert.equal(
    slotStat(
      item('s', 'Sword', {
        type: 'weapon',
        damage: [{ count: 1, sides: 8, damageType: 'slashing' }],
      }),
    ),
    '1d8 slashing',
  );
  assert.equal(slotStat(item('r', 'Ring', { type: 'ring', acBonus: 1 })), '+1 AC');
  assert.equal(slotStat(item('g', 'Rope', { type: 'gear' })), '');
});

test('the picker detail lists every effect and a stack size', () => {
  const splint = item('a', 'Splint', { type: 'armor', baseAC: 17, armorWeight: 'heavy' });
  assert.equal(pickerDetail(splint), 'heavy armor, AC 17');
  assert.equal(
    pickerDetail({ ...item('d', 'Dagger', { type: 'gear' }), quantity: 3 }),
    '3 carried',
  );
});

test('an item of a type the slot refuses, kept from an old save, sorts after the rest', () => {
  const hero = kit();
  const old = { ...hero, equipment: { ...hero.equipment, offHand: 'potion' } };
  const choices = slotChoices(old, slot('offHand'));
  assert.equal(choices.equipped?.id, 'potion');
  assert.equal(choices.items.at(-1)?.id, 'potion');
});

test('the picker detail reads an item with no quantity as one', () => {
  const { quantity: _drop, ...bare } = item('r', 'Rope', { type: 'gear' });
  assert.equal(pickerDetail(/** @type {any} */ (bare)), '');
});
