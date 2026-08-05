import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  creatureFields,
  creatureFieldsChange,
  readCreatureFields,
} from '../src/app/creatureFields.js';
import { gearOptions } from '../src/app/gearFields.js';
import { DEFAULT_CREATURE_HP, defaultEnemyGear } from '../src/entities/Creature.js';
import { defaultEnemyStats, STAT_KEYS } from '../src/entities/Modifiers.js';

/** @param {import('../src/types/modal.js').ModalField[]} fields @param {string} name */
function field(fields, name) {
  const found = fields.find((f) => f.name === name);
  assert.ok(found, `the form has a ${name} field`);
  return found;
}

/**
 * A stand-in for the modal form handle: enough of get/set/setOptions for the
 * onChange handler under test.
 * @param {Record<string, string | number>} initial
 */
function fakeForm(initial) {
  const values = new Map(Object.entries(initial).map(([k, v]) => [k, String(v)]));
  return {
    get: (/** @type {string} */ name) => values.get(name) ?? '',
    set: (/** @type {string} */ name, /** @type {string | number} */ value) =>
      values.set(name, String(value)),
    setOptions: () => {},
  };
}

/** The submitted values of a minimal, unleveled form. */
function baseValues() {
  return {
    name: 'X',
    role: '',
    disposition: 'neutral',
    notes: '',
    maxHP: '4',
    level: '',
    tier: 'mob',
    weapon: '',
    armor: '',
    casterClass: '',
    ...Object.fromEntries(STAT_KEYS.map((key) => [`stat-${key}`, '10'])),
  };
}

test('an unleveled seed starts at the commoner hit points, unarmed and unarmored', () => {
  const fields = creatureFields({ disposition: 'neutral' }, gearOptions(null));
  assert.equal(field(fields, 'maxHP').value, DEFAULT_CREATURE_HP);
  assert.equal(field(fields, 'level').value, '', 'the level starts blank');
  assert.equal(field(fields, 'weapon').value, '', 'no level means no default loadout');
  assert.equal(field(fields, 'armor').value, '');
  for (const key of STAT_KEYS) assert.equal(field(fields, `stat-${key}`).value, 10);
});

test('a leveled seed pre-fills the loadout and the stat defaults for its level', () => {
  const fields = creatureFields({ disposition: 'hostile', level: 1 }, gearOptions(null));
  const stamp = defaultEnemyGear(1, 'mob');
  assert.equal(field(fields, 'weapon').value, stamp.weapon.name);
  assert.equal(field(fields, 'armor').value, stamp.armor.name);
  const stats = defaultEnemyStats(1, 'mob');
  assert.equal(field(fields, 'stat-STR').value, stats.STR);
  assert.equal(field(fields, 'disposition').value, 'hostile');
});

test('a seed with explicit null gear shows None even when leveled', () => {
  const seed = { disposition: 'hostile', level: 3, weapon: null, armor: null };
  const fields = creatureFields(seed, gearOptions(seed));
  assert.equal(field(fields, 'weapon').value, '');
  assert.equal(field(fields, 'armor').value, '');
});

test('the AC input pre-fills from a seed DEX until the GM types over it', () => {
  const derived = creatureFields({ stats: { DEX: 16 } }, gearOptions(null));
  assert.equal(field(derived, 'stat-AC').value, 13);
  const typed = creatureFields({ stats: { DEX: 16, AC: 18 } }, gearOptions(null));
  assert.equal(field(typed, 'stat-AC').value, 18, 'a stored AC wins over the derived one');
});

test('an edit shows the hit points and gear the creature already carries', () => {
  const seed = {
    maxHP: 22,
    weapon: { name: 'Rusty Cleaver', kind: 'melee', damage: [] },
    armor: { name: 'Bone Plate', acBonus: 3 },
  };
  const fields = creatureFields(seed, gearOptions(seed));
  assert.equal(field(fields, 'maxHP').value, 22);
  assert.equal(field(fields, 'weapon').value, 'Rusty Cleaver');
  assert.equal(field(fields, 'armor').value, 'Bone Plate');
});

test('readCreatureFields reads identity, disposition, stats, and gear back', () => {
  const gear = gearOptions(null);
  const values = {
    ...baseValues(),
    name: '  Smith  ',
    role: ' Blacksmith ',
    disposition: 'friendly',
    notes: ' Forges blades. ',
    maxHP: '11',
    weapon: 'Shortsword',
    ...Object.fromEntries(STAT_KEYS.map((key) => [`stat-${key}`, '12'])),
  };
  const read = readCreatureFields(values, gear);
  assert.equal(read.name, 'Smith');
  assert.equal(read.role, 'Blacksmith');
  assert.equal(read.disposition, 'friendly');
  assert.equal(read.notes, 'Forges blades.');
  assert.equal(read.maxHP, 11);
  assert.equal(read.stats.AC, 12, 'AC is read, not re-derived from DEX');
  assert.equal(read.weapon.name, 'Shortsword');
  assert.equal(read.armor, null, 'the empty picker is the explicit None');
});

test('a blank level stores no level and no tier', () => {
  const read = readCreatureFields(baseValues(), gearOptions(null));
  assert.equal('level' in read, false);
  assert.equal('tier' in read, false);
});

test('a typed level stores the level and the tier, clamped to at least 1', () => {
  const gear = gearOptions(null);
  const read = readCreatureFields({ ...baseValues(), level: '6', tier: 'legend' }, gear);
  assert.equal(read.level, 6);
  assert.equal(read.tier, 'legend');
  assert.equal(readCreatureFields({ ...baseValues(), level: '-2' }, gear).level, 1);
});

test('a blank or nonsense maximum reads as the commoner default', () => {
  const gear = gearOptions(null);
  assert.equal(readCreatureFields({ ...baseValues(), maxHP: '' }, gear).maxHP, DEFAULT_CREATURE_HP);
  assert.equal(
    readCreatureFields({ ...baseValues(), maxHP: 'tough' }, gear).maxHP,
    DEFAULT_CREATURE_HP,
  );
  assert.equal(
    readCreatureFields({ ...baseValues(), maxHP: '-6' }, gear).maxHP,
    1,
    'a negative clamps to 1',
  );
});

test('a level change re-stamps the stat defaults until a stat is hand-edited', () => {
  const onChange = creatureFieldsChange({ restampStats: true });
  const form = fakeForm({ level: '6', tier: 'mob', 'stat-STR': '10' });
  onChange('level', form);
  assert.equal(form.get('stat-STR'), String(defaultEnemyStats(6, 'mob').STR));
  onChange('stat-STR', form);
  form.set('stat-STR', '20');
  onChange('level', form);
  assert.equal(form.get('stat-STR'), '20', 'a touched stat stops the re-stamping');
});

test('no re-stamp happens while the level is blank, or when re-stamping is off', () => {
  const onChange = creatureFieldsChange({ restampStats: true });
  const blank = fakeForm({ level: '', tier: 'mob', 'stat-STR': '10' });
  onChange('level', blank);
  assert.equal(blank.get('stat-STR'), '10', 'an unleveled creature keeps its typed stats');
  const off = creatureFieldsChange({ restampStats: false });
  const form = fakeForm({ level: '6', tier: 'mob', 'stat-STR': '10' });
  off('level', form);
  assert.equal(form.get('stat-STR'), '10', 'an edit never re-stamps a stored block');
});
