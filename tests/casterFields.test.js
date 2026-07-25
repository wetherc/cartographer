import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  casterClassOptions,
  spellPickerOptions,
  spellbookIds,
  spellbookFromIds,
  readCasterOptions,
} from '../src/app/casterFields.js';

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
