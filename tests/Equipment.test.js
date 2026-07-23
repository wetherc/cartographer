import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EQUIPMENT_SLOTS,
  ITEM_TYPES,
  emptyEquipment,
  itemType,
  equip,
  getEquipped,
  pruneEquipment,
} from '../src/entities/Equipment.js';
import { createCharacter, withDefaults, addItem, removeItem } from '../src/entities/Character.js';

/** @returns {import('../src/types/entities.js').Character} */
function heroWithSword() {
  let hero = createCharacter('c1', 'Hero');
  hero = addItem(hero, { id: 'sword', name: 'Sword', quantity: 1, notes: '', type: 'weapon' });
  hero = addItem(hero, { id: 'rope', name: 'Rope', quantity: 2, notes: '' });
  return hero;
}

test('every equipment slot key is unique and covered by emptyEquipment', () => {
  const keys = EQUIPMENT_SLOTS.map((s) => s.key);
  assert.equal(new Set(keys).size, keys.length);
  assert.deepEqual(Object.keys(emptyEquipment()).sort(), [...keys].sort());
  assert.equal(EQUIPMENT_SLOTS.every((s) => s.suggests.every((t) => ITEM_TYPES.includes(t))), true);
});

test('itemType defaults an untyped (older-save) item to gear', () => {
  assert.equal(itemType({ id: 'rope', name: 'Rope', quantity: 1, notes: '' }), 'gear');
  assert.equal(itemType({ id: 'sword', name: 'Sword', quantity: 1, notes: '', type: 'weapon' }), 'weapon');
});

test('equip fills a slot and getEquipped resolves it to the inventory item', () => {
  const hero = equip(heroWithSword(), 'mainHand', 'sword');
  assert.equal(getEquipped(hero, 'mainHand')?.name, 'Sword');
  assert.equal(getEquipped(hero, 'offHand'), null);
});

test('equip with null clears the slot', () => {
  let hero = equip(heroWithSword(), 'mainHand', 'sword');
  hero = equip(hero, 'mainHand', null);
  assert.equal(getEquipped(hero, 'mainHand'), null);
});

test('equip on a pre-equipment character fills in the other slots as empty', () => {
  const legacy = { ...heroWithSword() };
  delete legacy.equipment;
  const hero = equip(legacy, 'armor', 'rope');
  assert.deepEqual(hero.equipment, { armor: 'rope', mainHand: null, offHand: null, ranged: null });
});

test('getEquipped returns null when the referenced stack has left the inventory', () => {
  const hero = equip(heroWithSword(), 'mainHand', 'sword');
  const bare = { ...hero, inventory: hero.inventory.filter((i) => i.id !== 'sword') };
  assert.equal(getEquipped(bare, 'mainHand'), null);
});

test('removeItem unequips a stack that hits zero but keeps a surviving stack equipped', () => {
  let hero = equip(heroWithSword(), 'mainHand', 'sword');
  hero = equip(hero, 'offHand', 'rope');

  hero = removeItem(hero, 'rope', 1); // 1 left: still equipped
  assert.equal(getEquipped(hero, 'offHand')?.quantity, 1);

  hero = removeItem(hero, 'sword', 1); // gone: unequipped
  assert.equal(hero.equipment?.mainHand, null);
  assert.equal(hero.equipment?.offHand, 'rope', 'other slots untouched');
});

test('pruneEquipment returns the character unchanged when nothing dangles', () => {
  const hero = equip(heroWithSword(), 'mainHand', 'sword');
  assert.equal(pruneEquipment(hero), hero);
});

test('withDefaults backfills empty equipment on an older save, keeping existing slots', () => {
  const legacy = { ...createCharacter('c1', 'Hero') };
  delete legacy.equipment;
  assert.deepEqual(withDefaults(legacy).equipment, emptyEquipment());

  const partial = { ...heroWithSword(), equipment: { armor: null, mainHand: 'sword', offHand: null, ranged: null } };
  assert.equal(withDefaults(partial).equipment?.mainHand, 'sword');
});
