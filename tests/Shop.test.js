import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buyItem, buyableTemplates, itemFromTemplate } from '../src/entities/Shop.js';
import { createCharacter } from '../src/entities/Character.js';
import { defaultEquipmentTemplates } from '../src/library/LibraryMerge.js';

/** @typedef {import('../src/types/library.js').EquipmentTemplate} EquipmentTemplate */

/** @type {EquipmentTemplate} */
const torch = { name: 'Torch', type: 'gear', light: true, cost: 0.01 };
/** @type {EquipmentTemplate} */
const sword = {
  name: 'Longsword',
  type: 'weapon',
  kind: 'melee',
  damage: [{ count: 1, sides: 8, damageType: 'slashing' }],
  cost: 15,
};

const hero = (purse = { pp: 0, gp: 20, ep: 0, sp: 0, cp: 0 }) => ({
  ...createCharacter('h', 'Hero'),
  inventory: [],
  purse,
});

test('buyableTemplates keeps priced entries, by type order and then by name', () => {
  const list = buyableTemplates([
    sword,
    { name: 'Rope', type: 'gear' },
    torch,
    { name: 'Bedroll', type: 'gear', cost: 1 },
    { name: 'Dagger', type: 'weapon', cost: 2 },
    { name: 'Free', type: 'gear', cost: 0 },
  ]);
  assert.deepEqual(
    list.map((t) => t.name),
    ['Bedroll', 'Torch', 'Dagger', 'Longsword'],
  );
});

test('buyableTemplates lists the priced built-in equipment', () => {
  const names = buyableTemplates(defaultEquipmentTemplates()).map((t) => t.name);
  assert.ok(names.includes('Longsword'));
  assert.ok(names.includes('Torch'));
  assert.ok(!names.includes('Arcane Focus'), 'a focus has no single SRD price');
});

test('itemFromTemplate copies the fields but not the price', () => {
  const item = itemFromTemplate(sword, 2);
  assert.deepEqual(item, {
    name: 'Longsword',
    type: 'weapon',
    kind: 'melee',
    damage: [{ count: 1, sides: 8, damageType: 'slashing' }],
    id: 'longsword',
    quantity: 2,
    notes: '',
  });
  assert.notEqual(item.damage, sword.damage);
  assert.equal(itemFromTemplate({ name: '!!', type: 'gear' }, 1).id, 'item');
});

test('buyItem takes the price from the purse and adds the stack', () => {
  const result = buyItem(hero(), sword, 1);
  assert.ok(!('error' in result));
  assert.equal(result.price, '15 gp');
  assert.equal(result.count, 1);
  assert.deepEqual(result.character.purse, { pp: 0, gp: 5, ep: 0, sp: 0, cp: 0 });
  assert.equal(result.character.inventory[0].name, 'Longsword');
  assert.equal(result.character.inventory[0].cost, undefined);
});

test('buyItem prices the whole stack and stacks a second buy', () => {
  const first = buyItem(hero({ pp: 0, gp: 1, ep: 0, sp: 0, cp: 0 }), torch, 10);
  assert.ok(!('error' in first));
  assert.equal(first.price, '1 sp');
  assert.deepEqual(first.character.purse, { pp: 0, gp: 0, ep: 0, sp: 9, cp: 0 });
  const second = buyItem(first.character, torch, 5);
  assert.ok(!('error' in second));
  assert.equal(second.character.inventory.length, 1);
  assert.equal(second.character.inventory[0].quantity, 15);
});

test('buyItem reads a count below 1 or text as 1', () => {
  for (const count of [0, -3, Number.NaN]) {
    const result = buyItem(hero(), sword, count);
    assert.ok(!('error' in result));
    assert.equal(result.count, 1);
  }
  const result = buyItem(hero(), sword, 1.8);
  assert.ok(!('error' in result));
  assert.equal(result.count, 1);
});

test('buyItem refuses a buy the purse cannot cover and changes nothing', () => {
  const short = buyItem(hero({ pp: 0, gp: 3, ep: 0, sp: 2, cp: 0 }), sword, 2);
  assert.deepEqual(short, { error: 'Longsword x2 costs 30 gp. Hero has 3 gp, 2 sp.' });
  const { purse: _purse, ...noPurse } = hero();
  const broke = buyItem(/** @type {any} */ (noPurse), torch, 1);
  assert.deepEqual(broke, { error: 'Torch x1 costs 1 cp. Hero has no coins.' });
});

test('buyItem adds to a carried stack of the same name and type', () => {
  const pack = {
    ...hero(),
    inventory: [
      {
        id: 'torch',
        name: 'torch',
        quantity: 5,
        notes: 'old',
        type: /** @type {const} */ ('gear'),
      },
      {
        id: 'torch-2',
        name: 'Torch',
        quantity: 1,
        notes: '',
        type: /** @type {const} */ ('weapon'),
      },
    ],
  };
  const result = buyItem(pack, torch, 10);
  assert.ok(!('error' in result));
  assert.deepEqual(
    result.character.inventory.map((i) => [i.id, i.quantity]),
    [
      ['torch', 15],
      ['torch-2', 1],
    ],
  );
  const untyped = { ...hero(), inventory: [{ id: 'rope', name: 'Rope', quantity: 1, notes: '' }] };
  const rope = buyItem(untyped, { name: 'Rope', type: 'gear', cost: 1 }, 2);
  assert.ok(!('error' in rope));
  assert.equal(rope.character.inventory[0].quantity, 3);
});
