import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyRacePicks, currentRacePicks, racePickFields } from '../src/app/raceEdit.js';
import { withRace } from '../src/entities/Races.js';
import { createCharacter } from '../src/entities/Character.js';
import { getProficiencies, withProficiencies } from '../src/entities/Proficiencies.js';

const base = createCharacter('m', 'Mirelle', {
  STR: 10,
  DEX: 10,
  CON: 10,
  INT: 10,
  WIS: 10,
  CHA: 10,
});
const halfElf = withRace(base, 'half-elf', { abilities: ['CON', 'WIS'], skills: ['history'] });

test('currentRacePicks reads the floating increases and the stored picks', () => {
  assert.deepEqual(currentRacePicks(halfElf), {
    abilities: ['CON', 'WIS'],
    skills: ['history'],
    resistance: '',
    tool: '',
  });
});

test('racePickFields offers the picks of the race and nothing for other races', () => {
  const [abilities] = racePickFields(halfElf);
  assert.equal(abilities.name, 'raceAbilities');
  assert.equal(abilities.value, 'CON,WIS');
  assert.equal(abilities.section, 'Race (Half-Elf)');
  assert.ok(!abilities.options?.some((o) => o.value === 'CHA'));
  const dragon = withRace(base, 'dragonborn', { resistance: 'fire' });
  assert.deepEqual(
    racePickFields(dragon).map((f) => [f.name, f.value]),
    [['raceResistance', 'fire']],
  );
  assert.deepEqual(racePickFields(withRace(base, 'dwarf')), []);
  assert.deepEqual(racePickFields(base), []);
});

test('applyRacePicks moves the floating increases to the new abilities', () => {
  const next = applyRacePicks(halfElf, { raceAbilities: 'STR,DEX' });
  assert.equal(next.stats.STR, 11);
  assert.equal(next.stats.DEX, 11);
  assert.equal(next.stats.CON, 10);
  assert.equal(next.stats.WIS, 10);
  assert.equal(next.stats.CHA, 12);
  assert.deepEqual(next.raceTraits?.chosenSkills, ['history']);
});

test('applyRacePicks keeps the race skills in the proficiency list', () => {
  const prof = withProficiencies(halfElf, {
    ...getProficiencies(halfElf),
    skills: ['history'],
  });
  const next = applyRacePicks(prof, { raceAbilities: 'STR,DEX' });
  assert.deepEqual(getProficiencies(next).skills, ['history']);
});

test('applyRacePicks swaps the ancestry resistance', () => {
  const dragon = withRace(base, 'dragonborn', { resistance: 'fire' });
  const next = applyRacePicks(dragon, { raceResistance: 'cold' });
  assert.deepEqual(next.raceTraits?.resistances, ['cold']);
});

test('applyRacePicks leaves the character alone when nothing changed', () => {
  assert.equal(applyRacePicks(halfElf, { raceAbilities: 'WIS,CON' }), halfElf);
  assert.equal(applyRacePicks(halfElf, {}), halfElf);
  assert.equal(applyRacePicks(base, { raceAbilities: 'STR' }), base);
});
