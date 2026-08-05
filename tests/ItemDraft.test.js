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
    strength: 0,
    stealthDisadvantage: false,
    acBonus: 0,
    buffStat: '',
    buffAmount: 1,
    kind: 'melee',
    category: 'simple',
    properties: [],
    rangeNormal: 20,
    rangeLong: 60,
    versatileDamage: [{ count: 1, sides: 8, damageType: 'slashing' }],
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

test('a shield carries its AC bonus, and an absent one reads as the 5e +2', () => {
  assert.equal(assembleItem(draft({ type: 'shield', acBonus: '3' }))?.acBonus, 3);
  // The form's minimum stops a zero being typed, so an item without the field
  // is one the GM never edited. Equipment.js reads that as SHIELD_AC.
  assert.equal('acBonus' in assembleItem(draft({ type: 'shield', acBonus: 0 })), false);
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

test('a weapon carries its kind, category, and dice; a non-weapon carries none', () => {
  const sword = assembleItem(draft({ type: 'weapon', category: 'martial' }));
  assert.equal(sword?.kind, 'melee');
  assert.equal(sword?.category, 'martial');
  assert.deepEqual(sword?.damage, [{ count: 1, sides: 6, damageType: 'slashing' }]);
  const rope = assembleItem(draft({ type: 'gear' }));
  assert.equal('kind' in rope, false);
  assert.equal('damage' in rope, false);
});

test('an empty category is left out: the weapon is a natural weapon', () => {
  const bite = assembleItem(draft({ type: 'weapon', category: '' }));
  assert.equal('category' in bite, false);
});

test('properties survive only when some are checked', () => {
  const rapier = assembleItem(draft({ type: 'weapon', properties: ['finesse'] }));
  assert.deepEqual(rapier?.properties, ['finesse']);
  assert.equal('properties' in assembleItem(draft({ type: 'weapon' })), false);
});

test('the range survives only on a ranged or thrown weapon', () => {
  const bow = assembleItem(draft({ type: 'bow', kind: 'ranged', rangeNormal: 80, rangeLong: 320 }));
  assert.deepEqual(bow?.range, { normal: 80, long: 320 });
  const spear = assembleItem(draft({ type: 'weapon', properties: ['thrown'] }));
  assert.deepEqual(spear?.range, { normal: 20, long: 60 });
  assert.equal('range' in assembleItem(draft({ type: 'weapon' })), false);
});

test('an unreadable range falls back to the default for the kind', () => {
  const odd = assembleItem(
    draft({ type: 'bow', kind: 'ranged', rangeNormal: 'far', rangeLong: '' }),
  );
  assert.deepEqual(odd?.range, { normal: 80, long: 320 }, 'a ranged weapon reads as a shortbow');
  const thrown = assembleItem(
    draft({ type: 'weapon', properties: ['thrown'], rangeNormal: 'near', rangeLong: null }),
  );
  assert.deepEqual(thrown?.range, { normal: 20, long: 60 }, 'a melee weapon reads as a dagger');
});

test('the long range never undercuts the normal range', () => {
  const odd = assembleItem(draft({ type: 'bow', kind: 'ranged', rangeNormal: 100, rangeLong: 5 }));
  assert.deepEqual(odd?.range, { normal: 100, long: 100 });
});

test('versatile damage survives only with the versatile flag', () => {
  const sword = assembleItem(draft({ type: 'weapon', properties: ['versatile'] }));
  assert.deepEqual(sword?.versatileDamage, [{ count: 1, sides: 8, damageType: 'slashing' }]);
  assert.equal('versatileDamage' in assembleItem(draft({ type: 'weapon' })), false);
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

test('a shield preset is labelled by its flat bonus', () => {
  assert.equal(presetLabel({ name: 'Shield', acBonus: 2 }), 'Shield (+2 AC)');
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

test('the two armor traits are written only when set, and only on body armor', () => {
  const armor = (/** @type {Record<string, unknown>} */ extra) =>
    assembleItem(draft({ type: 'armor', ...extra }));
  assert.equal(armor({}) && 'strength' in armor({}), false, 'zero is no requirement');
  assert.equal(
    armor({}) && 'stealthDisadvantage' in armor({}),
    false,
    'quiet armor stays the shape it was before the field existed',
  );
  assert.equal(armor({ strength: '15' })?.strength, 15);
  assert.equal(armor({ strength: -3 })?.strength, undefined, 'a negative score is no requirement');
  assert.equal(armor({ stealthDisadvantage: true })?.stealthDisadvantage, true);
  const helm = assembleItem(draft({ type: 'helmet', strength: 15, stealthDisadvantage: true }));
  assert.deepEqual(
    { strength: helm?.strength, stealth: helm?.stealthDisadvantage },
    { strength: undefined, stealth: undefined },
    'a helmet is not body armor, so neither trait survives',
  );
});
