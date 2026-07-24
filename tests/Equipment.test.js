import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EQUIPMENT_SLOTS,
  ITEM_TYPES,
  emptyEquipment,
  migrateEquipment,
  itemType,
  slotAccepts,
  equip,
  getEquipped,
  armorClass,
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
  assert.equal(EQUIPMENT_SLOTS.every((s) => s.accepts.every((t) => ITEM_TYPES.includes(t))), true);
});

test('armor is worn piecewise: helmet, chest, gloves, and greaves are slots', () => {
  const keys = EQUIPMENT_SLOTS.map((s) => s.key);
  for (const k of ['helmet', 'chest', 'gloves', 'greaves']) assert.ok(keys.includes(k), k);
});

test('slotAccepts enforces item-type compatibility per slot', () => {
  const potion = { id: 'potion', name: 'Potion', quantity: 1, notes: '', type: /** @type {const} */ ('consumable') };
  const mail = { id: 'mail', name: 'Chain Mail', quantity: 1, notes: '', type: /** @type {const} */ ('armor') };
  const shield = { id: 'shield', name: 'Shield', quantity: 1, notes: '', type: /** @type {const} */ ('shield') };
  const sword = { id: 'sword', name: 'Sword', quantity: 1, notes: '', type: /** @type {const} */ ('weapon') };
  assert.equal(slotAccepts('chest', potion), false, 'a potion cannot be worn as armor');
  assert.equal(slotAccepts('chest', mail), true);
  assert.equal(slotAccepts('helmet', mail), false, 'chest armor is not a helmet');
  assert.equal(slotAccepts('offHand', shield), true);
  assert.equal(slotAccepts('offHand', sword), true, 'off hand also takes a weapon');
  assert.equal(slotAccepts('mainHand', shield), false);
});

test('equip is a no-op for an item the slot does not accept', () => {
  let hero = heroWithSword();
  hero = addItem(hero, { id: 'potion', name: 'Potion', quantity: 1, notes: '', type: 'consumable' });
  assert.equal(equip(hero, 'chest', 'potion'), hero, 'potion as armor rejected');
  assert.equal(equip(hero, 'mainHand', 'missing'), hero, 'unknown item rejected');
  assert.equal(equip(hero, 'mainHand', 'sword').equipment?.mainHand, 'sword');
});

test('migrateEquipment carries the legacy armor slot into chest', () => {
  assert.deepEqual(migrateEquipment(undefined), emptyEquipment());
  const legacy = { armor: 'chain-mail', mainHand: 'sword', offHand: null, ranged: null };
  const migrated = migrateEquipment(legacy);
  assert.equal(migrated.chest, 'chain-mail');
  assert.equal(migrated.mainHand, 'sword');
  assert.equal(migrated.helmet, null);
  assert.ok(!('armor' in migrated), 'legacy key dropped');
  // An explicit chest value wins over the legacy armor key.
  assert.equal(migrateEquipment({ armor: 'old', chest: 'new' }).chest, 'new');
});

test('armorClass is 10 + DEX modifier + equipped AC bonuses', () => {
  let hero = createCharacter('c1', 'Hero', { DEX: 14 }); // +2
  assert.equal(armorClass(hero), 12, 'unarmored: 10 + DEX mod');
  hero = addItem(hero, { id: 'mail', name: 'Chain Mail', quantity: 1, notes: '', type: 'armor', acBonus: 4 });
  hero = addItem(hero, { id: 'shield', name: 'Shield', quantity: 1, notes: '', type: 'shield', acBonus: 2 });
  assert.equal(armorClass(hero), 12, 'carrying armor does nothing until equipped');
  hero = equip(hero, 'chest', 'mail');
  hero = equip(hero, 'offHand', 'shield');
  assert.equal(armorClass(hero), 18);
  hero = equip(hero, 'offHand', null);
  assert.equal(armorClass(hero), 16, 'unequipping drops the bonus');
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
  const hero = equip(legacy, 'mainHand', 'sword');
  assert.deepEqual(hero.equipment, { ...emptyEquipment(), mainHand: 'sword' });
});

test('getEquipped returns null when the referenced stack has left the inventory', () => {
  const hero = equip(heroWithSword(), 'mainHand', 'sword');
  const bare = { ...hero, inventory: hero.inventory.filter((i) => i.id !== 'sword') };
  assert.equal(getEquipped(bare, 'mainHand'), null);
});

test('removeItem unequips a stack that hits zero but keeps a surviving stack equipped', () => {
  let hero = heroWithSword();
  hero = addItem(hero, { id: 'buckler', name: 'Buckler', quantity: 2, notes: '', type: 'shield' });
  hero = equip(hero, 'mainHand', 'sword');
  hero = equip(hero, 'offHand', 'buckler');

  hero = removeItem(hero, 'buckler', 1); // 1 left: still equipped
  assert.equal(getEquipped(hero, 'offHand')?.quantity, 1);

  hero = removeItem(hero, 'sword', 1); // gone: unequipped
  assert.equal(hero.equipment?.mainHand, null);
  assert.equal(hero.equipment?.offHand, 'buckler', 'other slots untouched');
});

test('pruneEquipment returns the character unchanged when nothing dangles', () => {
  const hero = equip(heroWithSword(), 'mainHand', 'sword');
  assert.equal(pruneEquipment(hero), hero);
});

test('withDefaults backfills empty equipment on an older save, migrating armor to chest', () => {
  const legacy = { ...createCharacter('c1', 'Hero') };
  delete legacy.equipment;
  assert.deepEqual(withDefaults(legacy).equipment, emptyEquipment());

  const partial = /** @type {any} */ ({
    ...heroWithSword(),
    equipment: { armor: 'mail', mainHand: 'sword', offHand: null, ranged: null },
  });
  const filled = withDefaults(partial);
  assert.equal(filled.equipment?.mainHand, 'sword');
  assert.equal(filled.equipment?.chest, 'mail', 'legacy armor slot reads as chest');
});
