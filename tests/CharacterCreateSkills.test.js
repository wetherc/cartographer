import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCharacter, characterFormChange } from '../src/app/characterCreate.js';
import { getProficiencies } from '../src/entities/Proficiencies.js';

/**
 * A form handle over a plain record that records the class skill options.
 * @param {Record<string, string>} state
 */
function skillForm(state) {
  const form = {
    /** @type {string[]} */
    skills: [],
    get: (/** @type {string} */ name) => state[name] ?? '',
    set: () => {},
    setOptions: (
      /** @type {string} */ name,
      /** @type {{ value: string, label: string }[]} */ options,
    ) => {
      if (name === 'skills') form.skills = options.map((o) => o.value);
    },
    setDisabled: () => {},
    setLabel: () => {},
    setRange: () => {},
    setHidden: () => {},
  };
  return form;
}

test('class skill options leave out the background skills', () => {
  const form = skillForm({ class: 'cleric', background: 'acolyte' });
  characterFormChange('background', form);
  assert.deepEqual(form.skills, ['history', 'medicine', 'persuasion']);
});

test('class skill options leave out the race skills and the race skill picks', () => {
  const state = { class: 'rogue', race: 'half-orc' };
  const form = skillForm(state);
  characterFormChange('race', form);
  assert.ok(!form.skills.includes('intimidation'));
  assert.ok(form.skills.includes('stealth'));
  const halfElf = skillForm({ class: 'rogue', race: 'half-elf', raceSkills: 'stealth' });
  characterFormChange('raceSkills', halfElf);
  assert.ok(!halfElf.skills.includes('stealth'));
  assert.ok(halfElf.skills.includes('intimidation'));
});

test('race skill picks of a race with no pick count are ignored', () => {
  const form = skillForm({ class: 'rogue', race: 'elf', raceSkills: 'stealth' });
  characterFormChange('race', form);
  assert.ok(form.skills.includes('stealth'));
  assert.ok(!form.skills.includes('perception'));
});

test('an Acolyte Cleric keeps four skills when the picks overlap the background', () => {
  const c = buildCharacter(
    {
      name: 'Mira',
      race: '',
      customRace: '',
      class: 'cleric',
      background: 'acolyte',
      'stat-STR': '10',
      'stat-DEX': '10',
      'stat-CON': '10',
      'stat-INT': '10',
      'stat-WIS': '10',
      'stat-CHA': '10',
      skills: 'insight,medicine,history',
      languages: '',
    },
    [],
  );
  assert.deepEqual([...getProficiencies(c).skills].sort(), [
    'history',
    'insight',
    'medicine',
    'religion',
  ]);
});
