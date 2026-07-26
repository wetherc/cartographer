import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  characterFields,
  characterFormChange,
  buildCharacter,
  defaultMaxHP,
} from '../src/app/characterCreate.js';
import { getHP, getSpellbook } from '../src/entities/Character.js';
import { getClasses } from '../src/entities/Multiclass.js';
import { getProficiencies } from '../src/entities/Proficiencies.js';
import { getHitDicePools } from '../src/entities/HitDice.js';
import { getSlotPools } from '../src/entities/SpellSlots.js';

/** @param {Partial<Record<string, string>>} overrides */
function values(overrides = {}) {
  return {
    name: 'Bron',
    race: '',
    customRace: '',
    class: '',
    background: '',
    'stat-STR': '16',
    'stat-DEX': '12',
    'stat-CON': '14',
    'stat-INT': '10',
    'stat-WIS': '10',
    'stat-CHA': '8',
    maxHP: '12',
    skills: '',
    languages: '',
    ...overrides,
  };
}

test('buildCharacter reads the typed scores and HP; no class means no pools', () => {
  const c = buildCharacter(values(), []);
  assert.equal(c.name, 'Bron');
  assert.equal(c.stats.STR, 16);
  assert.equal(getHP(c)?.max, 12);
  assert.deepEqual(getClasses(c), []);
  assert.deepEqual(getHitDicePools(c), []);
  assert.deepEqual(getSlotPools(c), []);
});

test('a catalog race applies its ability increases and snapshot', () => {
  const c = buildCharacter(values({ race: 'dwarf' }), []);
  assert.equal(c.race, 'Dwarf');
  assert.equal(c.raceId, 'dwarf');
  assert.equal(c.stats.CON, 16); // 14 + 2
  assert.equal(c.stats.WIS, 11);
  assert.ok(c.raceTraits);
  assert.ok(getProficiencies(c).weapons.includes('battleaxe'));
});

test('a custom race is just the display string', () => {
  const c = buildCharacter(values({ customRace: ' Tortle ' }), []);
  assert.equal(c.race, 'Tortle');
  assert.equal(c.raceId, undefined);
  assert.equal(c.stats.CON, 14);
});

test('class + background assemble the proficiency lists with the picks', () => {
  const c = buildCharacter(
    values({
      class: 'fighter',
      background: 'sage',
      skills: 'athletics,perception,stealth',
      languages: 'Elvish, Dwarvish, Gnomish',
    }),
    [],
  );
  assert.deepEqual(getClasses(c), [{ classId: 'fighter', level: 1 }]);
  assert.equal(c.background, 'sage');
  const p = getProficiencies(c);
  assert.deepEqual(p.saves, ['STR', 'CON']);
  assert.ok(p.skills.includes('athletics') && p.skills.includes('perception'));
  assert.ok(p.skills.includes('arcana') && p.skills.includes('history')); // sage
  // Fighter chooses 2: the third pick and the off-list one are dropped.
  assert.ok(!p.skills.includes('stealth'));
  // Sage grants 2 bonus languages; the third is dropped.
  assert.deepEqual(p.languages, ['Elvish', 'Dwarvish']);
  assert.deepEqual(
    getHitDicePools(c).map((r) => ({ id: r.id, max: r.max })),
    [{ id: 'hit-dice-d10', max: 1 }],
  );
});

test('skill picks outside the class list are dropped before the cap', () => {
  const c = buildCharacter(values({ class: 'fighter', skills: 'arcana,athletics,perception' }), []);
  const p = getProficiencies(c);
  assert.ok(p.skills.includes('athletics') && p.skills.includes('perception'));
  assert.ok(!p.skills.includes('arcana'));
});

test('languages without a background are dropped', () => {
  const c = buildCharacter(values({ languages: 'Elvish' }), []);
  assert.deepEqual(getProficiencies(c).languages, []);
});

test('a caster class gets slot pools and a spellbook', () => {
  const c = buildCharacter(values({ class: 'wizard' }), []);
  assert.equal(getSlotPools(c).length, 1);
  assert.deepEqual(getSpellbook(c).known, []);
});

test('the id avoids existing roster ids', () => {
  const c = buildCharacter(values(), ['bron']);
  assert.notEqual(c.id, 'bron');
});

test('a blank or garbage max HP falls back to the class default', () => {
  const c = buildCharacter(values({ class: 'fighter', maxHP: '' }), []);
  assert.equal(getHP(c)?.max, 12); // d10 + CON 2
});

test('defaultMaxHP folds in the race CON increase; classless reads 10', () => {
  assert.equal(defaultMaxHP('fighter', 14, ''), 12);
  assert.equal(defaultMaxHP('fighter', 14, 'dwarf'), 13);
  assert.equal(defaultMaxHP('', 14, ''), 10);
  assert.equal(defaultMaxHP('sorcerer', 1, ''), 1); // d6 - 5, clamped at the floor
});

/** A fake modal form handle over a plain record, capturing the side calls. */
function fakeForm(/** @type {Record<string, string>} */ state) {
  const form = {
    /** @type {{ value: string, label: string }[]} */
    options: [],
    /** @type {number | undefined} */
    max: undefined,
    /** @type {Record<string, boolean>} */
    disabled: {},
    /** @type {Record<string, string>} */
    labels: {},
    get: (/** @type {string} */ name) => state[name] ?? '',
    set: (/** @type {string} */ name, /** @type {string | number} */ value) => {
      state[name] = String(value);
    },
    setOptions: (
      /** @type {string} */ _name,
      /** @type {{ value: string, label: string }[]} */ opts,
      /** @type {number} */ max,
    ) => {
      form.options = opts;
      form.max = max;
    },
    setDisabled: (/** @type {string} */ name, /** @type {boolean} */ value) => {
      form.disabled[name] = value;
    },
    setLabel: (/** @type {string} */ name, /** @type {string} */ text) => {
      form.labels[name] = text;
    },
  };
  return form;
}

test('characterFormChange refilters skills and re-stamps max HP on class change', () => {
  /** @type {Record<string, string>} */
  const state = { class: 'fighter', 'stat-CON': '14', race: '' };
  const form = fakeForm(state);
  characterFormChange('class', form);
  assert.ok(form.options.some((o) => o.value === 'athletics' && o.label === 'Athletics'));
  assert.equal(form.max, 2); // fighter chooses 2
  assert.equal(form.labels.skills, 'Class skills (choose 2)');
  assert.equal(state.maxHP, '12');
  characterFormChange('stat-CON', { ...form, get: (n) => (n === 'stat-CON' ? '18' : state[n]) });
  assert.equal(state.maxHP, '14');
  characterFormChange('name', form); // unrelated field: nothing recomputed
  assert.equal(form.options.length > 0, true);
});

test('clearing the class empties the skill options and drops the caption count', () => {
  const form = fakeForm({ class: '', 'stat-CON': '14', race: '' });
  characterFormChange('class', form);
  assert.deepEqual(form.options, []);
  assert.equal(form.max, 0);
  assert.equal(form.labels.skills, 'Class skills');
});

test('a race pick locks the custom-race entry; clearing it unlocks', () => {
  /** @type {Record<string, string>} */
  const state = { class: '', 'stat-CON': '14', race: 'dwarf' };
  const form = fakeForm(state);
  characterFormChange('race', form);
  assert.equal(form.disabled.customRace, true);
  state.race = '';
  characterFormChange('race', form);
  assert.equal(form.disabled.customRace, false);
});

test('an empty skill-choice list means any skill (bard)', () => {
  const form = fakeForm({ class: 'bard', 'stat-CON': '14', race: '' });
  characterFormChange('class', form);
  assert.equal(form.options.length, 18);
  assert.equal(form.max, 3);
  const c = buildCharacter(values({ class: 'bard', skills: 'arcana,athletics,medicine' }), []);
  const p = getProficiencies(c);
  assert.ok(p.skills.includes('arcana') && p.skills.includes('medicine'));
});

test('characterFields covers the form surface once each', () => {
  const names = characterFields().map((f) => f.name);
  assert.deepEqual(new Set(names).size, names.length);
  for (const expected of [
    'name',
    'race',
    'customRace',
    'class',
    'background',
    'maxHP',
    'skills',
    'languages',
    'stat-STR',
  ]) {
    assert.ok(names.includes(expected), expected);
  }
});
