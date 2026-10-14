import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCharacter, characterFormChange } from '../src/app/characterCreate.js';
import { getProficiencies } from '../src/entities/Proficiencies.js';
import {
  classSkillCaption,
  grantedSkills,
  raceSkillChoice,
} from '../src/app/characterSkillPicks.js';

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

/**
 * A form handle that records every option list and caption by field name.
 * @param {Record<string, string>} state
 */
function recordingForm(state) {
  /** @type {Record<string, string[]>} */
  const options = {};
  /** @type {Record<string, string>} */
  const labels = {};
  const form = {
    options,
    labels,
    get: (/** @type {string} */ name) => state[name] ?? '',
    set: () => {},
    setOptions: (
      /** @type {string} */ name,
      /** @type {{ value: string, label: string }[]} */ list,
    ) => {
      options[name] = list.map((o) => o.value);
    },
    setDisabled: () => {},
    setLabel: (/** @type {string} */ name, /** @type {string} */ text) => {
      labels[name] = text;
    },
    setRange: () => {},
    setHidden: () => {},
  };
  return form;
}

test('the class skill caption names the skills the background gives', () => {
  const form = recordingForm({ class: 'cleric', background: 'acolyte' });
  characterFormChange('background', form);
  assert.equal(
    form.labels.skills,
    'Class skills (choose 2). Insight and Religion come from Acolyte.',
  );
});

test('the class skill caption names one race skill with "comes"', () => {
  const form = recordingForm({ class: 'rogue', race: 'half-orc' });
  characterFormChange('race', form);
  assert.equal(form.labels.skills, 'Class skills (choose 4). Intimidation comes from Half-Orc.');
});

test('the class skill caption of no class has no count', () => {
  assert.equal(classSkillCaption('', new Map()), 'Class skills');
});

test('a skill both the race and the background give names the background', () => {
  const granted = grantedSkills({ race: 'half-orc', background: 'criminal' });
  assert.equal(granted.get('stealth'), 'Criminal');
  assert.equal(granted.get('intimidation'), 'Half-Orc');
  const both = grantedSkills({
    race: 'half-elf',
    raceSkills: 'stealth,arcana',
    background: 'criminal',
  });
  assert.equal(both.get('stealth'), 'Criminal');
  assert.equal(both.get('arcana'), 'Half-Elf');
});

test('the Half-Elf race skill picks leave out the background skills', () => {
  const form = recordingForm({ race: 'half-elf', background: 'criminal' });
  characterFormChange('race', form);
  assert.ok(!form.options.raceSkills.includes('stealth'));
  assert.ok(form.options.raceSkills.includes('arcana'));
  const later = recordingForm({ race: 'half-elf', background: 'acolyte' });
  characterFormChange('background', later);
  assert.ok(!later.options.raceSkills.includes('insight'));
  assert.ok(later.options.raceSkills.includes('stealth'));
  assert.deepEqual(raceSkillChoice('elf').options, []);
});
