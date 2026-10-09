import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  creatureFields,
  creatureFieldsChange,
  readCreatureFields,
} from '../src/app/creatureFields.js';
import { gearOptions } from '../src/app/gearFields.js';
import { applyFieldRules } from '../src/view/FieldRules.js';
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
    disabled: new Map(),
    setDisabled(/** @type {string} */ name, /** @type {boolean} */ off) {
      this.disabled.set(name, off);
    },
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
    cr: '',
    saves: '',
    skills: '',
    resist: '',
    vulnerable: '',
    immune: '',
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
  const seed = { disposition: 'hostile', level: 3, weapons: [], armor: null };
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
    weapons: [{ name: 'Rusty Cleaver', kind: 'melee', damage: [] }],
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
  assert.equal(read.weapons[0].name, 'Shortsword');
  assert.equal(read.armor, null, 'the empty picker is the explicit None');
});

test('a blank level stores no level and no tier', () => {
  const read = readCreatureFields(baseValues(), gearOptions(null));
  assert.equal('level' in read, false);
  assert.equal('tier' in read, false);
});

test('a typed level stores the level and the tier', () => {
  const gear = gearOptions(null);
  const read = readCreatureFields({ ...baseValues(), level: '6', tier: 'legend' }, gear);
  assert.equal(read.level, 6);
  assert.equal(read.tier, 'legend');
});

test('a level of 0 or below, or one that is not a number, stores no level', () => {
  const gear = gearOptions(null);
  for (const level of ['0', '-2', 'boss']) {
    const read = readCreatureFields({ ...baseValues(), level }, gear);
    assert.equal('level' in read, false, `level ${level} reads as no level`);
    assert.equal('tier' in read, false, `level ${level} stores no tier`);
  }
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
  const zero = fakeForm({ level: '0', tier: 'mob', 'stat-STR': '10' });
  onChange('level', zero);
  assert.equal(zero.get('stat-STR'), '10', 'a level of 0 is no level too');
  const off = creatureFieldsChange({ restampStats: false });
  const form = fakeForm({ level: '6', tier: 'mob', 'stat-STR': '10' });
  off('level', form);
  assert.equal(form.get('stat-STR'), '10', 'an edit never re-stamps a stored block');
});

test('the rating picker offers Unrated first and pre-fills the seed rating', () => {
  const blank = field(creatureFields(null, gearOptions(null)), 'cr');
  assert.equal(blank.value, '');
  assert.equal(blank.options?.[0].value, '', 'Unrated leads the list');
  const seeded = field(creatureFields({ cr: 0.25 }, gearOptions(null)), 'cr');
  assert.equal(seeded.value, '0.25');
});

test('readCreatureFields reads a picked rating and omits a blank one', () => {
  const rated = readCreatureFields({ ...baseValues(), cr: '0.5' }, gearOptions(null));
  assert.equal(rated.cr, 0.5);
  assert.equal('cr' in readCreatureFields(baseValues(), gearOptions(null)), false);
  const junk = readCreatureFields({ ...baseValues(), cr: '1.5' }, gearOptions(null));
  assert.equal('cr' in junk, false, 'a value that names no step reads as unrated');
});

test('the proficiency pickers offer every ability and skill, pre-checked from the seed', () => {
  const fields = creatureFields(
    { proficiencies: { saves: ['DEX'], skills: ['stealth'] } },
    gearOptions(null),
  );
  const saves = field(fields, 'saves');
  const skills = field(fields, 'skills');
  assert.equal(saves.options?.length, 6, 'the six abilities');
  assert.equal(skills.options?.length, 18, 'the eighteen skills');
  assert.equal(saves.value, 'DEX');
  assert.equal(skills.value, 'stealth');
  assert.ok(
    skills.options?.some((o) => o.value === 'sleight-of-hand' && o.label === 'Sleight of Hand'),
    'a skill is offered by its display name',
  );
});

test('readCreatureFields reads both proficiency pickers and omits an empty pair', () => {
  const gear = gearOptions(null);
  const trained = readCreatureFields(
    { ...baseValues(), saves: 'DEX,WIS', skills: 'stealth' },
    gear,
  );
  assert.deepEqual(trained.proficiencies, { saves: ['DEX', 'WIS'], skills: ['stealth'] });
  assert.equal('proficiencies' in readCreatureFields(baseValues(), gear), false);
});

test('the defense pickers show a seed and read back its lists', () => {
  const seed = { defenses: { resist: ['fire'], vulnerable: [], immune: ['poison', 'necrotic'] } };
  const fields = creatureFields(seed, gearOptions(null));
  assert.equal(field(fields, 'resist').value, 'fire');
  assert.equal(field(fields, 'immune').value, 'poison,necrotic');
  const read = readCreatureFields(
    { ...baseValues(), resist: 'cold', immune: 'poison' },
    gearOptions(null),
  );
  assert.deepEqual(read.defenses, { resist: ['cold'], vulnerable: [], immune: ['poison'] });
  assert.equal('defenses' in readCreatureFields(baseValues(), gearOptions(null)), false);
});

test('the Multiattack box fills from the seed and stores only a count of 2 or more', () => {
  assert.equal(
    field(creatureFields({ multiattack: 2 }, gearOptions(null)), 'multiattack').value,
    2,
  );
  assert.equal(field(creatureFields(null, gearOptions(null)), 'multiattack').value, '');
  const gear = gearOptions(null);
  assert.equal(readCreatureFields({ ...baseValues(), multiattack: '3' }, gear).multiattack, 3);
  assert.equal(
    'multiattack' in readCreatureFields({ ...baseValues(), multiattack: '1' }, gear),
    false,
  );
});

test('creatureFields groups the form under section headings, scores before gear', () => {
  const fields = creatureFields({ level: 2 }, gearOptions(null));
  const sections = fields.filter((f) => f.section).map((f) => [f.section, f.name]);
  assert.deepEqual(sections, [
    ['Basics', 'name'],
    ['Combat', 'stat-STR'],
    ['Proficiencies', 'saves'],
    ['Defenses', 'resist'],
    ['Spellcasting', 'casterClass'],
  ]);
  const names = fields.map((f) => f.name);
  assert.ok(names.indexOf('stat-AC') < names.indexOf('weapon'));
  assert.deepEqual(
    fields.filter((f) => f.advanced).map((f) => f.name),
    ['resist', 'vulnerable', 'immune', 'conditionImmunities'],
  );
  assert.equal(new Set(names).size, names.length, 'no field repeats');
});

test('creatureFields opens Combat at the weapon when the stat block is left out', () => {
  const fields = creatureFields({ level: 2 }, gearOptions(null), { stats: false });
  assert.equal(field(fields, 'weapon').section, 'Combat');
  assert.equal(
    fields.some((f) => f.name.startsWith('stat-')),
    false,
  );
});

/**
 * The disabled state of each ruled field as the form opens, read from the
 * fields' starting values.
 * @param {import('../src/types/modal.js').ModalField[]} fields
 */
function openedRules(fields) {
  const values = new Map(fields.map((f) => [f.name, String(('value' in f ? f.value : '') ?? '')]));
  /** @type {Map<string, boolean>} */
  const off = new Map();
  applyFieldRules(
    fields,
    null,
    (n) => values.get(n) ?? '',
    (n, d) => off.set(n, d),
  );
  return off;
}

test('creatureFields disables a dependent field while its parent is blank', () => {
  const blank = openedRules(creatureFields({ level: 2 }, gearOptions(null)));
  for (const name of [
    'hitSaveDC',
    'hitSaveCondition',
    'surpriseDie',
    'multiattackDisadvantage',
    'casterLevel',
  ]) {
    assert.equal(blank.get(name), true, `${name} starts disabled`);
  }
  const set = openedRules(
    creatureFields(
      {
        level: 2,
        multiattack: 2,
        surpriseAttack: { count: 2, sides: 6 },
        class: 'wizard',
        weapons: [{ name: 'Bite', onHitSave: { ability: 'STR', dc: 11, condition: 'Prone' } }],
      },
      gearOptions(null),
    ),
  );
  for (const name of ['hitSaveDC', 'surpriseDie', 'multiattackDisadvantage', 'casterLevel']) {
    assert.equal(set.get(name), false, `${name} starts enabled`);
  }
});

test('an edited parent enables and disables the creature fields that depend on it', () => {
  const fields = creatureFields({ level: 2 }, gearOptions(null));
  const form = fakeForm({ hitSaveAbility: 'CON', multiattack: '1', surpriseCount: '' });
  const edit = (/** @type {string} */ name) =>
    applyFieldRules(fields, name, form.get, (n, d) => form.setDisabled(n, d));
  edit('hitSaveAbility');
  assert.equal(form.disabled.get('hitSaveDC'), false);
  assert.equal(form.disabled.get('hitSaveCondition'), false);
  edit('multiattack');
  assert.equal(form.disabled.get('multiattackDisadvantage'), true);
  edit('surpriseCount');
  assert.equal(form.disabled.get('surpriseDie'), true);
  edit('maxHP');
  assert.equal(form.disabled.has('maxHP'), false);
});

test('the AC field names the AC in use while armor is picked', () => {
  const gear = gearOptions(null);
  const bare = creatureFields({ disposition: 'neutral', stats: { AC: 15 } }, gear);
  assert.equal(field(bare, 'stat-AC').label, 'Base AC (no armor)');
  // Level 1 stamps Leather Armor (11 + DEX), which replaces 10 + DEX of the
  // authored AC: 15 - 10 + 11 = 16 at DEX 10.
  const leveled = creatureFields(
    { disposition: 'hostile', level: 1, stats: { AC: 15, DEX: 10 } },
    gear,
  );
  assert.equal(field(leveled, 'stat-AC').label, 'Base AC (no armor), AC in use 16');
});

test('creatureFieldsChange rewrites the AC caption when the armor or AC changes', () => {
  const gear = gearOptions(null);
  const onChange = creatureFieldsChange({ restampStats: false, gear });
  /** @type {Map<string, string>} */
  const labels = new Map();
  const form = {
    ...fakeForm({ armor: 'Leather Armor', 'stat-AC': '12', 'stat-DEX': '14' }),
    setLabel: (/** @type {string} */ name, /** @type {string} */ text) => labels.set(name, text),
  };
  onChange('armor', form);
  assert.equal(labels.get('stat-AC'), 'Base AC (no armor), AC in use 13');
  form.set('armor', '');
  onChange('armor', form);
  assert.equal(labels.get('stat-AC'), 'Base AC (no armor)');
  labels.clear();
  onChange('name', form);
  assert.equal(labels.size, 0, 'other fields leave the caption alone');
  creatureFieldsChange({ restampStats: false })('armor', form);
  assert.equal(labels.size, 0, 'a form with no gear has no AC caption to update');
});
