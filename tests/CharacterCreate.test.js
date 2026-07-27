import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  characterFields,
  characterFormChange,
  buildCharacter,
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
    skills: '',
    languages: '',
    ...overrides,
  };
}

test('buildCharacter reads the typed scores; no class means 10 HP and no pools', () => {
  const c = buildCharacter(values(), []);
  assert.equal(c.name, 'Bron');
  assert.equal(c.stats.STR, 16);
  assert.equal(getHP(c)?.max, 10);
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
  assert.ok(getProficiencies(c).weapons.named.includes('battleaxe'));
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

test('max HP derives from the class hit die and CON', () => {
  const c = buildCharacter(values({ class: 'fighter' }), []);
  assert.equal(getHP(c)?.max, 12); // d10 + CON 14's +2
});

test('max HP folds in the race CON increase; classless reads 10', () => {
  const dwarf = buildCharacter(values({ class: 'fighter', race: 'dwarf' }), []);
  assert.equal(getHP(dwarf)?.max, 13, "the dwarf's +2 CON takes 14 to 16");
  const classless = buildCharacter(values({ class: '' }), []);
  assert.equal(getHP(classless)?.max, 10);
  const frail = buildCharacter(values({ class: 'sorcerer', 'stat-CON': '1' }), []);
  assert.equal(getHP(frail)?.max, 1, 'd6 - 5, clamped at the floor');
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
    /** @type {Record<string, { min?: number, max?: number }>} */
    ranges: {},
    /** @type {Record<string, boolean>} */
    hidden: {},
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
    setRange: (
      /** @type {string} */ name,
      /** @type {number} */ min,
      /** @type {number} */ max,
    ) => {
      form.ranges[name] = { min, max };
    },
    setHidden: (/** @type {string} */ name, /** @type {boolean} */ value) => {
      form.hidden[name] = value;
    },
  };
  return form;
}

test('characterFormChange refilters skills on class change', () => {
  /** @type {Record<string, string>} */
  const state = { class: 'fighter', 'stat-CON': '14', race: '' };
  const form = fakeForm(state);
  characterFormChange('class', form);
  assert.ok(form.options.some((o) => o.value === 'athletics' && o.label === 'Athletics'));
  assert.equal(form.max, 2); // fighter chooses 2
  assert.equal(form.labels.skills, 'Class skills (choose 2)');
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
  const fields = characterFields();
  const names = fields.map((f) => f.name);
  assert.deepEqual(new Set(names).size, names.length);
  for (const expected of [
    'name',
    'race',
    'customRace',
    'class',
    'background',
    'statMethod',
    'reroll',
    'statPills',
    'skills',
    'languages',
    'stat-STR',
  ]) {
    assert.ok(names.includes(expected), expected);
  }
});

test('the form defaults to point buy: scores at 8, reroll and pills hidden', () => {
  const fields = characterFields();
  const method = fields.find((f) => f.name === 'statMethod');
  assert.equal(method?.value, 'point-buy');
  assert.ok(String(method?.label).includes('27 points left'));
  assert.equal(fields.find((f) => f.name === 'reroll')?.hidden, true);
  assert.equal(fields.find((f) => f.name === 'statPills')?.hidden, true);
  const str = fields.find((f) => f.name === 'stat-STR');
  assert.equal(str?.value, 8);
  // The stat inputs open range-limited to point buy's 8-15.
  assert.equal(str?.min, 8);
  assert.equal(str?.max, 15);
  // Max HP is derived, so the form doesn't ask for it.
  assert.equal(
    fields.find((f) => f.name === 'maxHP'),
    undefined,
  );
});

test('the reroll button sits after the ability-score fields', () => {
  const names = characterFields().map((f) => f.name);
  assert.ok(names.indexOf('reroll') > names.indexOf('stat-CHA'));
});

/** @param {Record<string, string>} state */
function statState(state) {
  return {
    'stat-STR': '8',
    'stat-DEX': '8',
    'stat-CON': '8',
    'stat-INT': '8',
    'stat-WIS': '8',
    'stat-CHA': '8',
    class: '',
    race: '',
    ...state,
  };
}

test('picking the standard array shows the unassigned pill grid at the 8 floor', () => {
  const state = statState({
    statMethod: 'standard-array',
    class: 'fighter',
    'stat-STR': '15',
    statPills: 'STR:15',
  });
  const form = fakeForm(state);
  characterFormChange('statMethod', form);
  assert.equal(state.statPills, ''); // pills start unassigned
  assert.equal(state['stat-STR'], '8');
  assert.equal(form.hidden.reroll, true);
  assert.equal(form.labels.statMethod, 'Ability scores');
  // Leaving point buy lifts the 8-15 range back to the shared positive floor.
  assert.deepEqual(form.ranges['stat-STR'], { min: 1, max: undefined });
  // The pill grid replaces the number inputs.
  assert.equal(form.hidden.statPills, false);
  assert.equal(form.hidden['stat-STR'], true);
});

test('re-picking point buy restores the 8-15 range and the number inputs', () => {
  const state = statState({ statMethod: 'point-buy' });
  const form = fakeForm(state);
  characterFormChange('statMethod', form);
  for (const key of ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']) {
    assert.deepEqual(form.ranges[`stat-${key}`], { min: 8, max: 15 });
    assert.equal(form.hidden[`stat-${key}`], false);
    assert.equal(form.disabled[`stat-${key}`], false);
  }
  assert.equal(form.hidden.statPills, true);
});

test('the roll method stamps 4d6-drop-lowest scores and unlocks reroll', () => {
  const state = statState({ statMethod: 'roll' });
  const form = fakeForm(state);
  let call = 0;
  const rng = () => [5, 4, 3, 2][call++ % 4] / 6; // always d6 faces 6,5,4,3
  characterFormChange('statMethod', form, rng);
  for (const key of ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']) {
    assert.equal(state[`stat-${key}`], '15'); // 6+5+4, drop the 3
  }
  assert.equal(form.hidden.reroll, false);
  assert.equal(form.disabled['stat-STR'], true); // rolled scores aren't editable
  characterFormChange('reroll', form, () => 0);
  assert.equal(state['stat-STR'], '3'); // all 1s rerolled
});

test('point-buy stat edits track the budget in the caption', () => {
  const state = statState({ statMethod: 'point-buy', 'stat-STR': '15' });
  const form = fakeForm(state);
  characterFormChange('stat-STR', form);
  assert.equal(form.labels.statMethod, 'Ability scores (18 points left)');
});

test('a point-buy edit that would overspend walks back down to what fits', () => {
  // 15/15/15 spends the whole budget; raising INT must first free points.
  const state = statState({
    statMethod: 'point-buy',
    'stat-STR': '15',
    'stat-DEX': '15',
    'stat-CON': '15',
    'stat-INT': '12',
  });
  const form = fakeForm(state);
  characterFormChange('stat-INT', form);
  assert.equal(state['stat-INT'], '8');
  assert.equal(form.labels.statMethod, 'Ability scores (0 points left)');
  // Dropping STR to 14 frees 2 points; a typed INT 15 then walks back to 10,
  // the most those 2 points buy.
  state['stat-STR'] = '14';
  characterFormChange('stat-STR', form);
  state['stat-INT'] = '15';
  characterFormChange('stat-INT', form);
  assert.equal(state['stat-INT'], '10');
  assert.equal(form.labels.statMethod, 'Ability scores (0 points left)');
});

test('a partial pill assignment copies through, unassigned abilities at 8', () => {
  const state = statState({
    statMethod: 'standard-array',
    statPills: 'CON:13,CHA:15',
    class: 'fighter',
    'stat-WIS': '10',
  });
  const form = fakeForm(state);
  characterFormChange('statPills', form);
  assert.equal(state['stat-CON'], '13');
  assert.equal(state['stat-CHA'], '15');
  assert.equal(state['stat-WIS'], '8'); // de-assigned pills fall back
});

test('the custom method leaves typed scores alone', () => {
  const state = statState({ statMethod: 'custom', 'stat-STR': '20' });
  const form = fakeForm(state);
  characterFormChange('statMethod', form);
  assert.equal(state['stat-STR'], '20');
  assert.equal(form.labels.statMethod, 'Ability scores');
  assert.equal(form.hidden.reroll, true);
});
