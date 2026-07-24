import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EQUIPMENT_SLOTS,
  ITEM_TYPES,
  ARMOR_WEIGHTS,
  SHIELD_AC,
  emptyEquipment,
  migrateEquipment,
  migrateItem,
  itemType,
  itemSummary,
  slotAccepts,
  equip,
  getEquipped,
  armorClass,
  effectiveStats,
  pruneEquipment,
  WEAPON_PRESETS,
  WEAPON_HANDLING,
  DIE_SIZES,
  DAMAGE_TYPES,
  weaponAbility,
  formatDamage,
  filterItems,
} from '../src/entities/Equipment.js';
import { createCharacter, withDefaults, addItem, removeItem, updateItem } from '../src/entities/Character.js';

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

test('unarmored AC is the character base AC + full DEX modifier', () => {
  const hero = createCharacter('c1', 'Hero', { DEX: 14 }); // +2
  assert.equal(armorClass(hero), 12, '10 + DEX mod by default');
  assert.equal(armorClass({ ...hero, baseAC: 13 }), 15, 'Mage Armor-style base AC raise');
});

test('body armor replaces the baseline; its weight class fixes the DEX scaling', () => {
  /** @param {import('../src/types/entities.js').ArmorWeight} weight @param {number} baseAC @param {number} dex */
  const acFor = (weight, baseAC, dex) => {
    let hero = createCharacter('c1', 'Hero', { DEX: dex });
    hero = addItem(hero, { id: 'suit', name: 'Suit', quantity: 1, notes: '', type: 'armor', armorWeight: weight, baseAC });
    assert.equal(armorClass(hero), 10 + Math.floor((dex - 10) / 2), 'carrying armor does nothing until equipped');
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

test('shields always grant a flat +2, ignoring any stored bonus', () => {
  let hero = createCharacter('c1', 'Hero'); // DEX 10, AC 10
  hero = addItem(hero, { id: 'shield', name: 'Shield', quantity: 1, notes: '', type: 'shield', acBonus: 9 });
  hero = equip(hero, 'offHand', 'shield');
  assert.equal(SHIELD_AC, 2);
  assert.equal(armorClass(hero), 12);
});

test('other equipped items add flat AC bonuses on top', () => {
  let hero = createCharacter('c1', 'Hero', { DEX: 14 });
  hero = addItem(hero, { id: 'helm', name: 'Helm', quantity: 1, notes: '', type: 'helmet', acBonus: 1 });
  hero = addItem(hero, { id: 'band', name: 'Band', quantity: 1, notes: '', type: 'ring', acBonus: 1 });
  hero = equip(hero, 'helmet', 'helm');
  hero = equip(hero, 'accessory', 'band');
  assert.equal(armorClass(hero), 14, '10 + 2 DEX + 1 helm + 1 ring');
});

test('effectiveStats folds equipped stat buffs in, and AC uses the buffed DEX', () => {
  let hero = createCharacter('c1', 'Hero', { STR: 14, DEX: 12 });
  hero = addItem(hero, { id: 'ring', name: 'Ring', quantity: 1, notes: '', type: 'ring', statBonuses: { STR: 2, DEX: 2 } });
  assert.equal(effectiveStats(hero).STR, 14, 'carried, not worn: no buff');
  hero = equip(hero, 'accessory', 'ring');
  assert.deepEqual(
    { STR: effectiveStats(hero).STR, DEX: effectiveStats(hero).DEX },
    { STR: 16, DEX: 14 },
  );
  assert.equal(hero.stats.STR, 14, 'base score untouched');
  assert.equal(armorClass(hero), 12, '10 + buffed DEX mod (+2)');
});

test('migrateItem turns bonus-era body armor into light armor with the same total AC', () => {
  const old = { id: 'mail', name: 'Chain Mail', quantity: 1, notes: '', type: /** @type {const} */ ('armor'), acBonus: 4 };
  const migrated = migrateItem(old);
  assert.deepEqual(
    { armorWeight: migrated.armorWeight, baseAC: migrated.baseAC, acBonus: migrated.acBonus },
    { armorWeight: 'light', baseAC: 14, acBonus: undefined },
  );
  const shield = migrateItem({ id: 's', name: 'S', quantity: 1, notes: '', type: /** @type {const} */ ('shield'), acBonus: 3 });
  assert.equal(shield.acBonus, undefined, 'shields drop stored bonuses');
  const modern = { id: 'plate', name: 'Plate', quantity: 1, notes: '', type: /** @type {const} */ ('armor'), armorWeight: /** @type {const} */ ('heavy'), baseAC: 18 };
  assert.equal(migrateItem(modern), modern, 'already-migrated items pass through by reference');
});

test('every armor weight has a positive default base AC and a distinct DEX cap', () => {
  assert.deepEqual(ARMOR_WEIGHTS.map((w) => w.key), ['light', 'medium', 'heavy']);
  assert.deepEqual(ARMOR_WEIGHTS.map((w) => w.dexCap), [Infinity, 2, 0]);
  assert.ok(ARMOR_WEIGHTS.every((w) => w.defaultBaseAC > 10));
});

test('itemSummary describes armor scaling, shield/flat bonuses, and stat buffs', () => {
  assert.equal(
    itemSummary({ id: 'a', name: 'A', quantity: 1, notes: '', type: 'armor', armorWeight: 'medium', baseAC: 14 }),
    'medium armor, AC 14 + DEX (max 2)',
  );
  assert.equal(
    itemSummary({ id: 'a', name: 'A', quantity: 1, notes: '', type: 'armor', armorWeight: 'heavy', baseAC: 16 }),
    'heavy armor, AC 16',
  );
  assert.equal(itemSummary({ id: 's', name: 'S', quantity: 1, notes: '', type: 'shield' }), '+2 AC');
  assert.equal(
    itemSummary({ id: 'r', name: 'R', quantity: 1, notes: '', type: 'ring', acBonus: 1, statBonuses: { STR: 2 } }),
    '+1 AC, +2 STR',
  );
  assert.equal(itemSummary({ id: 't', name: 'T', quantity: 1, notes: '', type: 'gear' }), '');
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

test('two ring slots: both equipped rings contribute their effects', () => {
  let hero = createCharacter('c1', 'Hero');
  hero = addItem(hero, { id: 'ward-ring', name: 'Ward Ring', quantity: 1, notes: '', type: 'ring', acBonus: 1 });
  hero = addItem(hero, { id: 'might-ring', name: 'Might Ring', quantity: 1, notes: '', type: 'ring', statBonuses: { STR: 2 } });
  hero = equip(hero, 'accessory', 'ward-ring');
  hero = equip(hero, 'accessory2', 'might-ring');
  assert.equal(armorClass(hero), 11, '10 base + ring AC bonus');
  assert.equal(effectiveStats(hero).STR, 12, 'second ring buffs STR');
  assert.equal(slotAccepts('accessory2', { id: 's', name: 'S', quantity: 1, notes: '', type: 'weapon' }), false);
});

test('migrateEquipment backfills the second ring slot on an older save', () => {
  const migrated = migrateEquipment({ accessory: 'ring-of-vigor' });
  assert.equal(migrated.accessory, 'ring-of-vigor');
  assert.equal(migrated.accessory2, null);
});

test('weaponAbility: melee reads STR; finesse and ranged read DEX; absent handling is melee', () => {
  const weapon = (handling) => ({ id: 'w', name: 'W', quantity: 1, notes: '', type: /** @type {const} */ ('weapon'), ...(handling ? { handling } : {}) });
  assert.equal(weaponAbility(weapon('melee')), 'STR');
  assert.equal(weaponAbility(weapon('finesse')), 'DEX');
  assert.equal(weaponAbility(weapon('ranged')), 'DEX');
  assert.equal(weaponAbility(weapon(null)), 'STR', 'older saves default to melee');
});

test('weapon presets follow 5e: valid dice, handling, and damage types', () => {
  assert.ok(WEAPON_PRESETS.length > 0);
  for (const preset of WEAPON_PRESETS) {
    assert.ok(WEAPON_HANDLING.some((h) => h.key === preset.handling), preset.name);
    assert.ok(preset.damage.length > 0, preset.name);
    for (const part of preset.damage) {
      assert.ok(part.count >= 1, preset.name);
      assert.ok(DIE_SIZES.includes(part.sides), preset.name);
      assert.ok(DAMAGE_TYPES.includes(part.damageType), preset.name);
    }
  }
  const greatsword = WEAPON_PRESETS.find((p) => p.name === 'Greatsword');
  assert.deepEqual(greatsword?.damage, [{ count: 2, sides: 6, damageType: 'slashing' }]);
  assert.equal(greatsword?.handling, 'melee');
});

test('formatDamage and itemSummary describe a weapon damage roll with riders', () => {
  const blade = {
    id: 'ember', name: 'Ember Blade', quantity: 1, notes: '',
    type: /** @type {const} */ ('weapon'), handling: /** @type {const} */ ('melee'),
    damage: [
      { count: 2, sides: 6, damageType: 'slashing' },
      { count: 1, sides: 4, damageType: 'fire' },
    ],
    statusEffects: ['burning'],
  };
  assert.equal(formatDamage(blade.damage), '2d6 slashing + 1d4 fire');
  assert.equal(itemSummary(blade), '2d6 slashing + 1d4 fire (STR), inflicts burning');
  const bow = { ...blade, id: 'bow', name: 'Longbow', type: /** @type {const} */ ('bow'), handling: /** @type {const} */ ('ranged'), damage: [{ count: 1, sides: 8, damageType: 'piercing' }], statusEffects: [] };
  assert.equal(itemSummary(bow), '1d8 piercing (DEX)');
});

test('filterItems searches name and description, filters by type, and sorts', () => {
  const items = [
    { id: 'torch', name: 'Torch', quantity: 5, notes: '', type: /** @type {const} */ ('gear') },
    { id: 'ember', name: 'Ember Blade', quantity: 1, notes: '', type: /** @type {const} */ ('weapon'), description: 'A greatsword with a smoldering edge.' },
    { id: 'mace', name: 'Mace', quantity: 1, notes: '', type: /** @type {const} */ ('weapon') },
  ];
  assert.deepEqual(filterItems(items).map((i) => i.id), ['ember', 'mace', 'torch'], 'name sort default');
  assert.deepEqual(filterItems(items, { query: 'SMOLDER' }).map((i) => i.id), ['ember'], 'description match, case-insensitive');
  assert.deepEqual(filterItems(items, { type: 'weapon' }).map((i) => i.id), ['ember', 'mace']);
  assert.deepEqual(filterItems(items, { sort: 'quantity' }).map((i) => i.id), ['torch', 'ember', 'mace']);
  assert.deepEqual(filterItems(items, { sort: 'type' }).map((i) => i.id), ['torch', 'ember', 'mace'], 'gear before weapon');
  assert.deepEqual(items.map((i) => i.id), ['torch', 'ember', 'mace'], 'input order untouched');
});

test('updateItem replaces fields, keeps the id, and unequips a slot that no longer accepts the item', () => {
  let hero = createCharacter('c1', 'Hero');
  hero = addItem(hero, { id: 'band', name: 'Plain Band', quantity: 1, notes: '', type: 'ring' });
  hero = equip(hero, 'accessory', 'band');

  const renamed = updateItem(hero, 'band', { id: 'ignored', name: 'Band of Vigor', quantity: 1, notes: '', type: 'ring', statBonuses: { STR: 2 } });
  assert.equal(renamed.inventory[0].name, 'Band of Vigor');
  assert.equal(renamed.inventory[0].id, 'band', 'id survives the edit');
  assert.equal(renamed.equipment?.accessory, 'band', 'still equipped');
  assert.equal(effectiveStats(renamed).STR, 12);

  const retyped = updateItem(renamed, 'band', { id: 'band', name: 'Band of Vigor', quantity: 1, notes: '', type: 'gear' });
  assert.equal(retyped.equipment?.accessory, null, 'gear cannot stay worn as a ring');
});
