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
  itemEffects,
  slotAccepts,
  equip,
  getEquipped,
  armorClass,
  effectiveStats,
  pruneEquipment,
  WEAPON_HANDLING,
  DIE_SIZES,
  DAMAGE_TYPES,
  weaponAbility,
  formatDamage,
  filterItems,
  groupItemsByType,
  isConsumable,
  equippedWeapons,
  equippedIndex,
  normalizeDamagePart,
  HEALING_TYPES,
} from '../src/entities/Equipment.js';
import {
  WEAPON_PRESETS,
  ARMOR_PRESETS,
  GEAR_PRESETS,
  CONSUMABLE_PRESETS,
  enemyArmor,
} from '../src/entities/EquipmentPresets.js';
import {
  createCharacter,
  withDefaults,
  addItem,
  removeItem,
  updateItem,
} from '../src/entities/Character.js';
import { item } from './helpers/fixtures.js';

/** @returns {import('../src/types/entities.js').Character} */
function heroWithSword() {
  let hero = createCharacter('c1', 'Hero');
  hero = addItem(hero, item('sword', 'Sword', { type: 'weapon' }));
  hero = addItem(hero, item('rope', 'Rope', { quantity: 2 }));
  return hero;
}

test('every equipment slot key is unique and covered by emptyEquipment', () => {
  const keys = EQUIPMENT_SLOTS.map((s) => s.key);
  assert.equal(new Set(keys).size, keys.length);
  assert.deepEqual(Object.keys(emptyEquipment()).sort(), [...keys].sort());
  assert.equal(
    EQUIPMENT_SLOTS.every((s) => s.accepts.every((t) => ITEM_TYPES.includes(t))),
    true,
  );
});

test('armor is worn piecewise: helmet, chest, gloves, and greaves are slots', () => {
  const keys = EQUIPMENT_SLOTS.map((s) => s.key);
  for (const k of ['helmet', 'chest', 'gloves', 'greaves']) assert.ok(keys.includes(k), k);
});

test('slotAccepts enforces item-type compatibility per slot', () => {
  const potion = item('potion', 'Potion', { type: 'consumable' });
  const mail = item('mail', 'Chain Mail', { type: 'armor' });
  const shield = item('shield', 'Shield', { type: 'shield' });
  const sword = item('sword', 'Sword', { type: 'weapon' });
  assert.equal(slotAccepts('chest', potion), false, 'a potion cannot be worn as armor');
  assert.equal(slotAccepts('chest', mail), true);
  assert.equal(slotAccepts('helmet', mail), false, 'chest armor is not a helmet');
  assert.equal(slotAccepts('offHand', shield), true);
  assert.equal(slotAccepts('offHand', sword), true, 'off hand also takes a weapon');
  assert.equal(slotAccepts('mainHand', shield), false);
});

test('equip is a no-op for an item the slot does not accept', () => {
  let hero = heroWithSword();
  hero = addItem(hero, item('potion', 'Potion', { type: 'consumable' }));
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

test('shields always grant a flat +2, ignoring any stored bonus', () => {
  let hero = createCharacter('c1', 'Hero'); // DEX 10, AC 10
  hero = addItem(hero, item('shield', 'Shield', { type: 'shield', acBonus: 9 }));
  hero = equip(hero, 'offHand', 'shield');
  assert.equal(SHIELD_AC, 2);
  assert.equal(armorClass(hero), 12);
});

test('other equipped items add flat AC bonuses on top', () => {
  let hero = createCharacter('c1', 'Hero', { DEX: 14 });
  hero = addItem(hero, item('helm', 'Helm', { type: 'helmet', acBonus: 1 }));
  hero = addItem(hero, item('band', 'Band', { type: 'ring', acBonus: 1 }));
  hero = equip(hero, 'helmet', 'helm');
  hero = equip(hero, 'accessory', 'band');
  assert.equal(armorClass(hero), 14, '10 + 2 DEX + 1 helm + 1 ring');
});

test('effectiveStats folds equipped stat buffs in, and AC uses the buffed DEX', () => {
  let hero = createCharacter('c1', 'Hero', { STR: 14, DEX: 12 });
  hero = addItem(hero, item('ring', 'Ring', { type: 'ring', statBonuses: { STR: 2, DEX: 2 } }));
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
  const old = item('mail', 'Chain Mail', { type: 'armor', acBonus: 4 });
  const migrated = migrateItem(old);
  assert.deepEqual(
    { armorWeight: migrated.armorWeight, baseAC: migrated.baseAC, acBonus: migrated.acBonus },
    { armorWeight: 'light', baseAC: 14, acBonus: undefined },
  );
  const shield = migrateItem(item('s', 'S', { type: 'shield', acBonus: 3 }));
  assert.equal(shield.acBonus, undefined, 'shields drop stored bonuses');
  const modern = item('plate', 'Plate', { type: 'armor', armorWeight: 'heavy', baseAC: 18 });
  assert.equal(migrateItem(modern), modern, 'already-migrated items pass through by reference');
});

test('every armor weight has a positive default base AC and a distinct DEX cap', () => {
  assert.deepEqual(
    ARMOR_WEIGHTS.map((w) => w.key),
    ['light', 'medium', 'heavy'],
  );
  assert.deepEqual(
    ARMOR_WEIGHTS.map((w) => w.dexCap),
    [Infinity, 2, 0],
  );
  assert.ok(ARMOR_WEIGHTS.every((w) => w.defaultBaseAC > 10));
});

test('itemSummary describes armor scaling, shield/flat bonuses, and stat buffs', () => {
  assert.equal(
    itemSummary(item('a', 'A', { type: 'armor', armorWeight: 'medium', baseAC: 14 })),
    'medium armor, AC 14 + DEX (max 2)',
  );
  assert.equal(
    itemSummary(item('a', 'A', { type: 'armor', armorWeight: 'heavy', baseAC: 16 })),
    'heavy armor, AC 16',
  );
  assert.equal(itemSummary(item('s', 'S', { type: 'shield' })), '+2 AC');
  assert.equal(
    itemSummary(item('r', 'R', { type: 'ring', acBonus: 1, statBonuses: { STR: 2 } })),
    '+1 AC, +2 STR',
  );
  assert.equal(itemSummary(item('t', 'T', { type: 'gear' })), '');
});

test('itemEffects keeps each effect as its own phrase for per-badge rendering', () => {
  assert.deepEqual(
    itemEffects(
      item('e', 'Ember Blade', {
        type: 'weapon',
        damage: [
          { count: 2, sides: 6, damageType: 'slashing' },
          { count: 1, sides: 4, damageType: 'fire' },
        ],
        statBonuses: { STR: 1, CHA: 2 },
        statusEffects: ['burning'],
      }),
    ),
    ['2d6 slashing + 1d4 fire (STR)', '+1 STR', '+2 CHA', 'inflicts burning'],
  );
  assert.deepEqual(itemEffects(item('t', 'T', { type: 'gear' })), []);
});

test('itemType defaults an untyped (older-save) item to gear', () => {
  assert.equal(itemType(item('rope', 'Rope')), 'gear');
  assert.equal(itemType(item('sword', 'Sword', { type: 'weapon' })), 'weapon');
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
  hero = addItem(hero, item('buckler', 'Buckler', { quantity: 2, type: 'shield' }));
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
  hero = addItem(hero, item('ward-ring', 'Ward Ring', { type: 'ring', acBonus: 1 }));
  hero = addItem(hero, item('might-ring', 'Might Ring', { type: 'ring', statBonuses: { STR: 2 } }));
  hero = equip(hero, 'accessory', 'ward-ring');
  hero = equip(hero, 'accessory2', 'might-ring');
  assert.equal(armorClass(hero), 11, '10 base + ring AC bonus');
  assert.equal(effectiveStats(hero).STR, 12, 'second ring buffs STR');
  assert.equal(slotAccepts('accessory2', item('s', 'S', { type: 'weapon' })), false);
});

test('migrateEquipment backfills the second ring slot on an older save', () => {
  const migrated = migrateEquipment({ accessory: 'ring-of-vigor' });
  assert.equal(migrated.accessory, 'ring-of-vigor');
  assert.equal(migrated.accessory2, null);
});

test('weaponAbility: melee reads STR; finesse and ranged read DEX; absent handling is melee', () => {
  const weapon = (handling) =>
    item('w', 'W', { type: 'weapon', ...(handling ? { handling } : {}) });
  assert.equal(weaponAbility(weapon('melee')), 'STR');
  assert.equal(weaponAbility(weapon('finesse')), 'DEX');
  assert.equal(weaponAbility(weapon('ranged')), 'DEX');
  assert.equal(weaponAbility(weapon(null)), 'STR', 'older saves default to melee');
});

test('weapon presets follow 5e: valid dice, handling, and damage types', () => {
  assert.ok(WEAPON_PRESETS.length > 0);
  for (const preset of WEAPON_PRESETS) {
    assert.ok(
      WEAPON_HANDLING.some((h) => h.key === preset.handling),
      preset.name,
    );
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

test('normalizeDamagePart repairs each field onto the supported values', () => {
  assert.deepEqual(normalizeDamagePart({ count: 2, sides: 8, damageType: 'fire' }), {
    count: 2,
    sides: 8,
    damageType: 'fire',
  });
  assert.deepEqual(normalizeDamagePart({ count: '3.7', sides: '10', damageType: 'cold' }), {
    count: 3,
    sides: 10,
    damageType: 'cold',
  });
  assert.deepEqual(normalizeDamagePart({ count: 0, sides: 7, damageType: 'sonic' }), {
    count: 1,
    sides: DIE_SIZES[0],
    damageType: DAMAGE_TYPES[0],
  });
});

test('normalizeDamagePart accepts a missing term rather than throwing', () => {
  const expected = { count: 1, sides: DIE_SIZES[0], damageType: DAMAGE_TYPES[0] };
  assert.deepEqual(normalizeDamagePart(undefined), expected);
  assert.deepEqual(normalizeDamagePart({}), expected);
});

test('normalizeDamagePart validates the type against the list it is given', () => {
  assert.equal(
    normalizeDamagePart({ count: 1, sides: 8, damageType: 'healing' }, HEALING_TYPES).damageType,
    'healing',
  );
  assert.equal(
    normalizeDamagePart({ count: 1, sides: 8, damageType: 'fire' }, HEALING_TYPES).damageType,
    'healing',
    'a damage type is not a kind of healing',
  );
  assert.equal(
    normalizeDamagePart({ count: 1, sides: 8, damageType: 'healing' }).damageType,
    DAMAGE_TYPES[0],
    'and healing is not a damage type, so a weapon cannot deal it',
  );
});

test('normalizeDamagePart keeps a flat bonus and omits it when zero', () => {
  assert.deepEqual(normalizeDamagePart({ count: 1, sides: 4, damageType: 'force', bonus: '1' }), {
    count: 1,
    sides: 4,
    damageType: 'force',
    bonus: 1,
  });
  assert.deepEqual(normalizeDamagePart({ count: 1, sides: 4, damageType: 'force', bonus: -2 }), {
    count: 1,
    sides: 4,
    damageType: 'force',
    bonus: -2,
  });
  assert.equal(
    'bonus' in normalizeDamagePart({ count: 1, sides: 4, damageType: 'force', bonus: 0 }),
    false,
    'a zero bonus stays absent, so an unbonused term keeps its old shape',
  );
  assert.equal('bonus' in normalizeDamagePart({ bonus: 'lots' }), false);
});

test('a bonus lets a term roll no dice, and no bonus keeps the one-die floor', () => {
  assert.deepEqual(normalizeDamagePart({ count: 0, sides: 4, damageType: 'poison', bonus: 3 }), {
    count: 0,
    sides: 4,
    damageType: 'poison',
    bonus: 3,
  });
  // Without a bonus there is nothing left to contribute, so a garbled or zero
  // count still reads as one die rather than as an empty term.
  assert.equal(normalizeDamagePart({ count: 0, sides: 4, damageType: 'poison' }).count, 1);
  assert.equal(normalizeDamagePart({ count: 'none', sides: 4, damageType: 'poison' }).count, 1);
});

test('formatDamage prints a flat bonus on its term, and alone when there are no dice', () => {
  assert.equal(
    formatDamage([{ count: 1, sides: 4, damageType: 'force', bonus: 1 }]),
    '1d4+1 force',
  );
  assert.equal(
    formatDamage([{ count: 7, sides: 8, damageType: 'necrotic', bonus: 30 }]),
    '7d8+30 necrotic',
  );
  assert.equal(
    formatDamage([{ count: 0, sides: 4, damageType: 'radiant', bonus: 1 }]),
    '+1 radiant',
  );
  assert.equal(formatDamage([{ count: 1, sides: 6, damageType: 'cold', bonus: -1 }]), '1d6-1 cold');
  assert.equal(
    formatDamage([{ count: 0, sides: 6, damageType: 'cold' }]),
    '',
    'a term with neither dice nor a bonus prints nothing',
  );
});

test('armor presets carry a valid weight class and a plausible base AC', () => {
  assert.ok(ARMOR_PRESETS.length > 0);
  for (const preset of ARMOR_PRESETS) {
    assert.ok(
      ARMOR_WEIGHTS.some((w) => w.key === preset.armorWeight),
      preset.name,
    );
    assert.ok(preset.baseAC >= 11 && preset.baseAC <= 18, preset.name);
  }
  const plate = ARMOR_PRESETS.find((p) => p.name === 'Plate');
  assert.deepEqual(plate, { name: 'Plate', armorWeight: 'heavy', baseAC: 18 });
});

test('gear and consumable presets are named and described', () => {
  for (const list of [GEAR_PRESETS, CONSUMABLE_PRESETS]) {
    assert.ok(list.length > 0);
    for (const preset of list) {
      assert.ok(preset.name.trim().length > 0);
      assert.ok(preset.description.trim().length > 0, preset.name);
    }
  }
  assert.ok(CONSUMABLE_PRESETS.some((p) => p.name === 'Potion of Healing'));
});

test('enemyArmor reads a preset as a flat bonus over the unarmored 10', () => {
  assert.deepEqual(enemyArmor('Leather Armor'), { name: 'Leather Armor', acBonus: 1 });
  assert.deepEqual(enemyArmor('Chain Mail'), { name: 'Chain Mail', acBonus: 6 });
  assert.deepEqual(enemyArmor('Plate'), { name: 'Plate', acBonus: 8 });
  assert.equal(enemyArmor('Cursed Robes'), null, 'unknown names return null');
});

test('formatDamage and itemSummary describe a weapon damage roll with riders', () => {
  const blade = item('ember', 'Ember Blade', {
    type: 'weapon',
    handling: 'melee',
    damage: [
      { count: 2, sides: 6, damageType: 'slashing' },
      { count: 1, sides: 4, damageType: 'fire' },
    ],
    statusEffects: ['burning'],
  });
  assert.equal(formatDamage(blade.damage), '2d6 slashing + 1d4 fire');
  assert.equal(itemSummary(blade), '2d6 slashing + 1d4 fire (STR), inflicts burning');
  const bow = item('bow', 'Longbow', {
    type: 'bow',
    handling: 'ranged',
    damage: [{ count: 1, sides: 8, damageType: 'piercing' }],
    statusEffects: [],
  });
  assert.equal(itemSummary(bow), '1d8 piercing (DEX)');
});

test('filterItems searches name and description, filters by type, and orders by name', () => {
  const items = [
    item('torch', 'Torch', { quantity: 5, type: 'gear' }),
    item('ember', 'Ember Blade', {
      type: 'weapon',
      description: 'A greatsword with a smoldering edge.',
    }),
    item('mace', 'Mace', { type: 'weapon' }),
  ];
  assert.deepEqual(
    filterItems(items).map((i) => i.id),
    ['ember', 'mace', 'torch'],
    'name sort default',
  );
  assert.deepEqual(
    filterItems(items, { query: 'SMOLDER' }).map((i) => i.id),
    ['ember'],
    'description match, case-insensitive',
  );
  assert.deepEqual(
    filterItems(items, { type: 'weapon' }).map((i) => i.id),
    ['ember', 'mace'],
  );
  assert.deepEqual(
    filterItems(items, { query: 'a', type: 'weapon' }).map((i) => i.id),
    ['ember', 'mace'],
    'query and type both applied',
  );
  assert.deepEqual(
    items.map((i) => i.id),
    ['torch', 'ember', 'mace'],
    'input order untouched',
  );
});

test('groupItemsByType keeps ITEM_TYPES order, drops empty types, and preserves each group order', () => {
  const items = [
    item('mace', 'Mace', { type: 'weapon' }),
    item('potion', 'Potion', { type: 'consumable', quantity: 2 }),
    item('rope', 'Rope', { type: 'gear' }),
    item('ember', 'Ember Blade', { type: 'weapon' }),
  ];
  assert.deepEqual(
    groupItemsByType(items).map((g) => [g.type, g.items.map((i) => i.id)]),
    [
      ['gear', ['rope']],
      ['weapon', ['mace', 'ember']],
      ['consumable', ['potion']],
    ],
  );
  assert.deepEqual(groupItemsByType([]), []);
  assert.deepEqual(
    items.map((i) => i.id),
    ['mace', 'potion', 'rope', 'ember'],
    'input order untouched',
  );
});

test('groupItemsByType files an item with no type under gear', () => {
  const untyped = { id: 'oddity', name: 'Oddity', quantity: 1 };
  assert.deepEqual(groupItemsByType([untyped]), [{ type: 'gear', items: [untyped] }]);
});

test('isConsumable is true only for the consumable type', () => {
  assert.equal(isConsumable(item('potion', 'Potion', { type: 'consumable' })), true);
  assert.equal(isConsumable(item('mace', 'Mace', { type: 'weapon' })), false);
  assert.equal(isConsumable({ id: 'oddity', name: 'Oddity', quantity: 1 }), false);
});

test('updateItem replaces fields, keeps the id, and unequips a slot that no longer accepts the item', () => {
  let hero = createCharacter('c1', 'Hero');
  hero = addItem(hero, item('band', 'Plain Band', { type: 'ring' }));
  hero = equip(hero, 'accessory', 'band');

  const renamed = updateItem(
    hero,
    'band',
    item('ignored', 'Band of Vigor', { type: 'ring', statBonuses: { STR: 2 } }),
  );
  assert.equal(renamed.inventory[0].name, 'Band of Vigor');
  assert.equal(renamed.inventory[0].id, 'band', 'id survives the edit');
  assert.equal(renamed.equipment?.accessory, 'band', 'still equipped');
  assert.equal(effectiveStats(renamed).STR, 12);

  const retyped = updateItem(renamed, 'band', item('band', 'Band of Vigor', { type: 'gear' }));
  assert.equal(retyped.equipment?.accessory, null, 'gear cannot stay worn as a ring');
});

test('equippedWeapons lists the wielded damage-carrying items in slot order', () => {
  let hero = createCharacter('c1', 'Hero');
  hero = addItem(
    hero,
    item('sword', 'Sword', {
      type: 'weapon',
      handling: 'melee',
      damage: [{ count: 1, sides: 8, damageType: 'slashing' }],
    }),
  );
  hero = addItem(
    hero,
    item('bow', 'Bow', {
      type: 'bow',
      handling: 'ranged',
      damage: [{ count: 1, sides: 6, damageType: 'piercing' }],
    }),
  );
  hero = addItem(hero, item('shield', 'Shield', { type: 'shield' }));
  hero = equip(hero, 'ranged', 'bow');
  hero = equip(hero, 'mainHand', 'sword');
  hero = equip(hero, 'offHand', 'shield');
  assert.deepEqual(
    equippedWeapons(hero).map((w) => w.id),
    ['sword', 'bow'],
    'main hand first, shield never',
  );
});

test('equippedWeapons skips weapons without a damage roll and empty hands', () => {
  let hero = heroWithSword(); // sword has no damage field
  assert.deepEqual(equippedWeapons(hero), []);
  hero = equip(hero, 'mainHand', 'sword');
  assert.deepEqual(equippedWeapons(hero), [], 'a damage-less weapon is not attackable');
});

test('weaponAbility falls back to STR when the handling value is unknown', () => {
  // An out-of-vocabulary handling finds no entry, so the ability defaults.
  const exotic = item('w', 'Odd', { type: 'weapon', handling: /** @type {any} */ ('thrown') });
  assert.equal(weaponAbility(exotic), 'STR');
});

test('migrateItem keeps an explicit weight and defaults a missing bonus to zero', () => {
  const migrated = migrateItem(
    item('brig', 'Brigandine', { type: 'armor', armorWeight: 'medium' }),
  );
  assert.deepEqual(
    { armorWeight: migrated.armorWeight, baseAC: migrated.baseAC },
    { armorWeight: 'medium', baseAC: 10 },
    'stored weight survives; a missing acBonus reads as +0',
  );
});

test('effectiveStats treats a buff to an unlisted stat as starting from 10', () => {
  let hero = createCharacter('c1', 'Hero');
  hero = addItem(hero, item('charm', 'Lucky Charm', { type: 'ring', statBonuses: { LUK: 3 } }));
  hero = equip(hero, 'accessory', 'charm');
  assert.equal(effectiveStats(hero).LUK, 13, 'absent stat starts at 10, +3 buff');
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

test('itemEffects: light armor reports "+ DEX"; an unknown weight also reads as light', () => {
  assert.equal(
    itemSummary(item('a', 'A', { type: 'armor', armorWeight: 'light', baseAC: 12 })),
    'light armor, AC 12 + DEX',
  );
  assert.equal(
    itemSummary(
      item('b', 'B', { type: 'armor', armorWeight: /** @type {any} */ ('void'), baseAC: 13 }),
    ),
    'light armor, AC 13 + DEX',
    'an unrecognized weight is reported and scaled as light',
  );
});

test('itemEffects renders a negative stat penalty without a leading plus', () => {
  assert.deepEqual(
    itemEffects(item('curse', 'Cursed Band', { type: 'ring', statBonuses: { STR: -2, DEX: 0 } })),
    ['-2 STR'],
    'negative shows its sign; a zero delta is dropped',
  );
});

test('pruneEquipment returns a pre-equipment character untouched', () => {
  const legacy = { ...createCharacter('c1', 'Hero') };
  delete legacy.equipment;
  assert.equal(pruneEquipment(legacy), legacy, 'no equipment record: nothing to prune');
});

test('equippedIndex maps each filled slot to its item and skips dangling ids', () => {
  let hero = heroWithSword();
  hero = equip(hero, 'mainHand', 'sword');
  assert.deepEqual([...equippedIndex(hero).keys()], ['mainHand']);
  assert.equal(equippedIndex(hero).get('mainHand')?.name, 'Sword');
  const dangling = { ...hero, equipment: { ...hero.equipment, offHand: 'ghost' } };
  assert.deepEqual([...equippedIndex(dangling).keys()], ['mainHand'], 'a missing item is not worn');
});

test('equippedIndex follows a character through an edit rather than caching the old one', () => {
  let hero = heroWithSword();
  hero = equip(hero, 'mainHand', 'sword');
  assert.equal(equippedIndex(hero).size, 1);
  const renamed = updateItem(hero, 'sword', { ...hero.inventory[0], name: 'Longsword' });
  assert.equal(equippedIndex(renamed).get('mainHand')?.name, 'Longsword');
  const bare = equip(hero, 'mainHand', null);
  assert.equal(equippedIndex(bare).size, 0);
  assert.equal(equippedIndex(hero).size, 1, 'the earlier character keeps its own answer');
});

test('a character saved before equipment slots existed wears nothing', () => {
  const hero = heroWithSword();
  const { equipment: _slots, ...legacy } = hero;
  assert.equal(equippedIndex(/** @type {any} */ (legacy)).size, 0);
  assert.equal(getEquipped(/** @type {any} */ (legacy), 'mainHand'), null);
});

test('an unarmored character with no stored base AC falls back to 10', () => {
  const hero = createCharacter('c1', 'Hero', { DEX: 14 }); // +2
  const { baseAC: _base, ...legacy } = hero;
  assert.equal(armorClass(/** @type {any} */ (legacy)), 12, '10 + DEX mod');
});

test('body armor with no stated weight is treated as light', () => {
  let hero = createCharacter('c1', 'Hero', { DEX: 18 }); // +4
  hero = addItem(hero, item('plate', 'Old Mail', { type: 'armor', baseAC: 12 }));
  hero = equip(hero, 'chest', 'plate');
  assert.equal(armorClass(hero), 16, '12 + full DEX (+4)');
  assert.deepEqual(itemEffects(hero.inventory[0]), ['light armor, AC 12 + DEX']);
});
