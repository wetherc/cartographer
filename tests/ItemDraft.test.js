import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  EQUIPPABLE_TYPES,
  FLAT_AC_TYPES,
  assembleItem,
  presetLabel,
} from '../src/entities/ItemDraft.js';
import { ITEM_TYPES, WEAPON_TYPES } from '../src/entities/Equipment.js';

/** Every item control, so a test states only what it is about. */
function draft(extra = {}) {
  return {
    name: 'Rope',
    description: '',
    quantity: 1,
    type: 'gear',
    notes: '',
    armorWeight: 'medium',
    baseAC: 14,
    acBonus: 0,
    buffStat: '',
    buffAmount: 1,
    handling: 'melee',
    damage: [{ count: 1, sides: 6, damageType: 'slashing' }],
    statusEffects: [],
    spellFocus: false,
    ...extra,
  };
}

test('a plain stack keeps only the fields every item has', () => {
  assert.deepEqual(assembleItem(draft()), {
    name: 'Rope',
    quantity: 1,
    notes: '',
    type: 'gear',
  });
});

test('the spellcasting-focus flag survives on any type, and an unticked box is absent', () => {
  assert.equal(assembleItem(draft({ spellFocus: true }))?.spellFocus, true);
  assert.equal(
    assembleItem(draft({ type: 'weapon', name: 'Quarterstaff', spellFocus: true }))?.spellFocus,
    true,
    'a staff is an arcane focus, so no type gates the flag',
  );
  assert.equal('spellFocus' in assembleItem(draft()), false);
});

test('a stack of zero or fewer is refused the way an empty name is', () => {
  assert.equal(assembleItem(draft({ quantity: 0 })), null);
  assert.equal(assembleItem(draft({ quantity: -2 })), null);
  assert.equal(assembleItem(draft({ quantity: 'lots' })), null);
  assert.equal(assembleItem(draft({ quantity: '' })), null);
});

test('the name is trimmed and an empty description is left out', () => {
  const withText = assembleItem(draft({ name: '  Rope  ', description: '  50 feet ' }));
  assert.equal(withText?.name, 'Rope');
  assert.equal(withText?.description, '50 feet');
  assert.equal('description' in assembleItem(draft({ description: '   ' })), false);
});

test('body armour carries its weight class and base AC', () => {
  const armor = assembleItem(draft({ type: 'armor', armorWeight: 'heavy', baseAC: '18' }));
  assert.equal(armor?.armorWeight, 'heavy');
  assert.equal(armor?.baseAC, 18);
});

test('an unusable base AC falls back rather than storing nonsense', () => {
  assert.equal(assembleItem(draft({ type: 'armor', baseAC: 'thick' }))?.baseAC, 10);
  assert.equal(assembleItem(draft({ type: 'armor', baseAC: 0 }))?.baseAC, 10);
  assert.equal(assembleItem(draft({ type: 'armor', baseAC: -4 }))?.baseAC, 1);
});

test('armour fields are dropped for anything that is not body armour', () => {
  const rope = assembleItem(draft({ type: 'gear', armorWeight: 'heavy', baseAC: 18 }));
  assert.equal('armorWeight' in rope, false);
  assert.equal('baseAC' in rope, false);
});

test('a flat AC bonus is kept only for the types that can wear one', () => {
  assert.equal(assembleItem(draft({ type: 'ring', acBonus: '2' }))?.acBonus, 2);
  assert.equal('acBonus' in assembleItem(draft({ type: 'gear', acBonus: 2 })), false);
});

test('a zero or unreadable AC bonus is left out rather than stored as zero', () => {
  assert.equal('acBonus' in assembleItem(draft({ type: 'ring', acBonus: 0 })), false);
  assert.equal('acBonus' in assembleItem(draft({ type: 'ring', acBonus: '' })), false);
  assert.equal('acBonus' in assembleItem(draft({ type: 'ring', acBonus: -3 })), false);
});

test('a stat buff needs an equippable type, a stat, and a non-zero amount', () => {
  assert.deepEqual(
    assembleItem(draft({ type: 'ring', buffStat: 'STR', buffAmount: '2' }))?.statBonuses,
    {
      STR: 2,
    },
  );
  assert.deepEqual(
    assembleItem(draft({ type: 'ring', buffStat: 'DEX', buffAmount: -1 }))?.statBonuses,
    { DEX: -1 },
  );
  assert.equal(
    'statBonuses' in assembleItem(draft({ type: 'gear', buffStat: 'STR', buffAmount: 2 })),
    false,
  );
  assert.equal(
    'statBonuses' in assembleItem(draft({ type: 'ring', buffStat: '', buffAmount: 2 })),
    false,
  );
  assert.equal(
    'statBonuses' in assembleItem(draft({ type: 'ring', buffStat: 'STR', buffAmount: 0 })),
    false,
  );
});

test('a weapon carries its handling and dice; a non-weapon carries neither', () => {
  const sword = assembleItem(draft({ type: 'weapon', handling: 'finesse' }));
  assert.equal(sword?.handling, 'finesse');
  assert.deepEqual(sword?.damage, [{ count: 1, sides: 6, damageType: 'slashing' }]);
  const rope = assembleItem(draft({ type: 'gear' }));
  assert.equal('handling' in rope, false);
  assert.equal('damage' in rope, false);
});

test('inflicted effects ride along only when there are some, and only on a weapon', () => {
  assert.deepEqual(
    assembleItem(draft({ type: 'weapon', statusEffects: ['Poisoned'] }))?.statusEffects,
    ['Poisoned'],
  );
  assert.equal('statusEffects' in assembleItem(draft({ type: 'weapon' })), false);
  assert.equal(
    'statusEffects' in assembleItem(draft({ type: 'gear', statusEffects: ['Poisoned'] })),
    false,
  );
});

test('notes come through from the item being edited rather than from a control', () => {
  assert.equal(assembleItem(draft({ notes: 'from the smith' }))?.notes, 'from the smith');
});

test('a weapon preset is labelled by its damage die', () => {
  assert.equal(
    presetLabel({ name: 'Longsword', damage: [{ count: 1, sides: 8, damageType: 'slashing' }] }),
    'Longsword (1d8)',
  );
});

test('an armour preset is labelled by its AC and weight, defaulting to light', () => {
  assert.equal(
    presetLabel({ name: 'Chain Mail', baseAC: 16, armorWeight: 'heavy' }),
    'Chain Mail (AC 16, heavy)',
  );
  assert.equal(presetLabel({ name: 'Padded', baseAC: 11 }), 'Padded (AC 11, light)');
});

test('anything else is labelled by name alone', () => {
  assert.equal(presetLabel({ name: 'Rope' }), 'Rope');
  assert.equal(presetLabel({ name: 'Dagger', damage: [] }), 'Dagger');
});

test('the two type lists name only real item types, and weapons are equippable', () => {
  for (const type of [...FLAT_AC_TYPES, ...EQUIPPABLE_TYPES]) {
    assert.ok(ITEM_TYPES.includes(type), `${type} is an item type`);
  }
  for (const type of WEAPON_TYPES) {
    assert.ok(EQUIPPABLE_TYPES.includes(type), `${type} can be equipped`);
  }
});
