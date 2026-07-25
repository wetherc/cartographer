import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  casterClassOptions,
  spellPickerOptions,
  maxSpellLevelForClass,
  spellbookIds,
  spellbookFromIds,
  readCasterOptions,
  refilterSpellsOnChange,
  casterFields,
} from '../src/app/casterFields.js';

test('casterFields seeds class, level, and pre-checked spells from a caster', () => {
  const fields = casterFields({
    class: 'wizard',
    casterLevel: 5,
    spellbook: { cantrips: ['fire-bolt'], known: ['magic-missile'], prepared: ['magic-missile'] },
  });
  const [cls, level, spells] = fields;
  assert.equal(cls.name, 'casterClass');
  assert.equal(cls.value, 'wizard');
  assert.equal(level.value, 5);
  assert.equal(spells.type, 'multiselect');
  assert.deepEqual(spells.value.split(',').sort(), ['fire-bolt', 'magic-missile']);
  assert.ok(
    spells.options.some((o) => o.value === 'fireball'),
    'options are filtered to a level-5 wizard',
  );
});

test('casterFields falls back to defaults for a null seed', () => {
  const [cls, level, spells] = casterFields(null);
  assert.equal(cls.value, '');
  assert.equal(level.value, 1);
  assert.equal(spells.value, '', 'no spellbook means nothing pre-checked');
});

test('casterFields reads a mob level when caster level is absent', () => {
  const [, level] = casterFields({ class: 'cleric', level: 3 });
  assert.equal(level.value, 3, 'the entity level seeds the caster level field');
});

test('casterClassOptions offers None plus caster classes only', () => {
  const options = casterClassOptions();
  assert.equal(options[0].value, '', 'None leads the list');
  const values = options.map((o) => o.value);
  assert.ok(values.includes('wizard'));
  assert.ok(values.includes('paladin'), 'half-casters included');
  assert.ok(!values.includes('fighter'), 'non-casters excluded');
  assert.ok(!values.includes('barbarian'));
});

test('spellPickerOptions labels cantrips and orders by level', () => {
  const options = spellPickerOptions();
  const fireBolt = options.find((o) => o.value === 'fire-bolt');
  assert.ok(fireBolt.label.startsWith('Cantrip'), 'a level-0 spell reads as a cantrip');
  const magicMissile = options.find((o) => o.value === 'magic-missile');
  assert.ok(magicMissile.label.startsWith('L1'));
  // Cantrips (level 0) sort ahead of leveled spells.
  const firstLeveled = options.findIndex((o) => !o.label.startsWith('Cantrip'));
  const lastCantrip = options.map((o) => o.label.startsWith('Cantrip')).lastIndexOf(true);
  assert.ok(lastCantrip < firstLeveled, 'all cantrips precede leveled spells');
});

test('maxSpellLevelForClass reads the class slot table, capping at its top level', () => {
  assert.equal(maxSpellLevelForClass('wizard', 1), 1, 'full caster L1 slots to 1st');
  assert.equal(maxSpellLevelForClass('wizard', 5), 3, 'full caster L5 slots to 3rd');
  assert.equal(maxSpellLevelForClass('wizard', 20), 9, 'full caster tops out at 9th');
  assert.equal(maxSpellLevelForClass('paladin', 1), 0, 'half caster has no slots at L1');
  assert.equal(maxSpellLevelForClass('paladin', 5), 2, 'half caster L5 slots to 2nd');
});

test('maxSpellLevelForClass computes pact progression for warlocks', () => {
  assert.equal(maxSpellLevelForClass('warlock', 1), 1);
  assert.equal(maxSpellLevelForClass('warlock', 3), 2);
  assert.equal(maxSpellLevelForClass('warlock', 9), 5);
  assert.equal(maxSpellLevelForClass('warlock', 20), 5, 'pact slots cap at 5th');
});

test('maxSpellLevelForClass is 0 for non-casters and unknown classes', () => {
  assert.equal(maxSpellLevelForClass('fighter', 20), 0);
  assert.equal(maxSpellLevelForClass('', 5), 0);
  assert.equal(maxSpellLevelForClass('bogus', 5), 0);
});

test('spellPickerOptions filters to the class list and castable levels', () => {
  const wizardL1 = spellPickerOptions('wizard', 1).map((o) => o.value);
  assert.ok(wizardL1.includes('fire-bolt'), 'a wizard cantrip is offered');
  assert.ok(wizardL1.includes('magic-missile'), 'a 1st-level wizard spell is offered');
  assert.ok(!wizardL1.includes('fireball'), 'a 3rd-level spell is out of reach at L1');
  assert.ok(!wizardL1.includes('cure-wounds'), 'an off-list spell is excluded');

  const wizardL5 = spellPickerOptions('wizard', 5).map((o) => o.value);
  assert.ok(wizardL5.includes('fireball'), 'the 3rd-level spell opens up at L5');
  assert.ok(!wizardL5.includes('cone-of-cold'), '5th-level still out of reach at L5');
});

test('spellPickerOptions offers the whole library when no caster class is set', () => {
  const all = spellPickerOptions('');
  const wizardOnly = spellPickerOptions('cleric', 5).map((o) => o.value);
  assert.ok(
    all.some((o) => o.value === 'fire-bolt'),
    'a wizard-only spell is present',
  );
  assert.ok(!wizardOnly.includes('fire-bolt'), 'but filtered out for a cleric');
  assert.ok(wizardOnly.includes('sacred-flame'), 'a cleric cantrip is offered to a cleric');
});

test('spellbookFromIds partitions cantrips from leveled spells and drops unknowns', () => {
  const book = spellbookFromIds(['fire-bolt', 'magic-missile', 'not-a-spell']);
  assert.deepEqual(book.cantrips, ['fire-bolt']);
  assert.deepEqual(book.known, ['magic-missile']);
  assert.deepEqual(book.prepared, ['magic-missile'], 'leveled spells land prepared too');
});

test('spellbookIds flattens a spellbook, de-duplicated', () => {
  const ids = spellbookIds({
    cantrips: ['light'],
    known: ['cure-wounds'],
    prepared: ['cure-wounds'],
  });
  assert.deepEqual(ids.sort(), ['cure-wounds', 'light']);
  assert.deepEqual(spellbookIds(undefined), []);
});

test('readCasterOptions builds caster options for a caster class', () => {
  const opts = readCasterOptions({
    casterClass: 'wizard',
    casterLevel: '5',
    spells: 'fire-bolt,magic-missile',
  });
  assert.equal(opts.class, 'wizard');
  assert.equal(opts.casterLevel, 5);
  assert.deepEqual(opts.spellbook.cantrips, ['fire-bolt']);
  assert.deepEqual(opts.spellbook.prepared, ['magic-missile']);
});

test('readCasterOptions returns nothing for a non-caster or None', () => {
  assert.deepEqual(readCasterOptions({ casterClass: '', casterLevel: '3', spells: '' }), {});
  assert.deepEqual(readCasterOptions({ casterClass: 'fighter', casterLevel: '3', spells: '' }), {});
});

test('readCasterOptions floors caster level to at least 1', () => {
  const opts = readCasterOptions({ casterClass: 'cleric', casterLevel: '0', spells: '' });
  assert.equal(opts.casterLevel, 1);
});

test('refilterSpellsOnChange refilters the spell picker only on caster field changes', () => {
  const calls = [];
  const form = {
    values: { casterClass: 'wizard', casterLevel: '5' },
    get(name) {
      return this.values[name];
    },
    setOptions(name, options) {
      calls.push({ name, options });
    },
  };
  assert.equal(refilterSpellsOnChange('name', form), false, 'unrelated fields are not handled');
  assert.equal(calls.length, 0);
  assert.equal(refilterSpellsOnChange('casterClass', form), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'spells');
  assert.ok(
    calls[0].options.every((o) => o.label.startsWith('Cantrip') || /^L[1-3] /.test(o.label)),
    'options are filtered to what a level-5 wizard can slot',
  );
  assert.equal(refilterSpellsOnChange('casterLevel', form), true);
  assert.equal(calls.length, 2);
});
