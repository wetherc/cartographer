import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyProficiencies,
  getProficiencies,
  assembleProficiencies,
  withProficiencies,
  withExpertise,
  isProficientSave,
  isProficientSkill,
  hasExpertise,
} from '../src/entities/Proficiencies.js';
import { createCharacter, withDefaults } from '../src/entities/Character.js';
import { withRace, withCustomRace } from '../src/entities/Races.js';
import { withBackground } from '../src/entities/Backgrounds.js';

/** A rogue elf criminal — every grant source populated. */
function rogueElf() {
  const base = withRace(createCharacter('c1', 'Vex'), 'elf');
  return { ...withBackground(base, 'criminal'), class: 'rogue' };
}

test('assembleProficiencies gathers fixed grants from class, race, and background', () => {
  const p = assembleProficiencies(rogueElf());
  assert.deepEqual(p.saves, ['DEX', 'INT']);
  assert.deepEqual(p.skills, ['perception', 'deception', 'stealth']);
  assert.deepEqual(p.weapons, [
    'simple',
    'hand crossbow',
    'longsword',
    'rapier',
    'shortsword',
    'shortbow',
    'longbow',
  ]);
  assert.deepEqual(p.armor, ['light']);
  assert.deepEqual(p.tools, ['gaming set', "thieves' tools"]);
  assert.deepEqual(p.languages, ['Common', 'Elvish']);
});

test('assembleProficiencies deduplicates overlapping grants', () => {
  const p = assembleProficiencies(rogueElf(), { skills: ['perception', 'acrobatics'] });
  assert.equal(p.skills.filter((s) => s === 'perception').length, 1);
  assert.ok(p.skills.includes('acrobatics'));
  assert.equal(p.weapons.filter((w) => w === 'shortsword').length, 1);
});

test('assembleProficiencies merges the chosen skills and languages', () => {
  const p = assembleProficiencies(rogueElf(), {
    skills: ['stealth', 'insight'],
    languages: ['Thieves’ Cant'],
  });
  assert.ok(p.skills.includes('insight'));
  assert.deepEqual(p.languages, ['Common', 'Elvish', 'Thieves’ Cant']);
});

test('assembleProficiencies with no class, race, or background is empty', () => {
  const c = withCustomRace(createCharacter('c1', 'Nim'), 'Githzerai');
  assert.deepEqual(assembleProficiencies(c), emptyProficiencies());
});

test('assembleProficiencies reads the race snapshot when the definition is gone', () => {
  const c = { ...withRace(createCharacter('c1', 'Vex'), 'elf'), raceId: 'deleted-custom' };
  const p = assembleProficiencies(c);
  assert.deepEqual(p.skills, ['perception']);
  assert.deepEqual(p.languages, ['Common', 'Elvish']);
});

test('withProficiencies stores deduplicated lists and defaults missing ones', () => {
  const c = withProficiencies(createCharacter('c1', 'Nim'), {
    saves: ['STR', 'STR', 'CON'],
    skills: ['athletics'],
  });
  assert.deepEqual(c.proficiencies.saves, ['STR', 'CON']);
  assert.deepEqual(c.proficiencies.skills, ['athletics']);
  assert.deepEqual(c.proficiencies.languages, []);
});

test('withProficiencies prunes expertise whose skill proficiency was removed', () => {
  let c = withProficiencies(createCharacter('c1', 'Nim'), { skills: ['stealth', 'athletics'] });
  c = withExpertise(c, ['stealth', 'athletics']);
  c = withProficiencies(c, { skills: ['athletics'] });
  assert.deepEqual(c.expertise, ['athletics']);
});

test('withExpertise deduplicates and filters to proficient skills', () => {
  const proficient = withProficiencies(createCharacter('c1', 'Nim'), { skills: ['stealth'] });
  const c = withExpertise(proficient, ['stealth', 'stealth', 'arcana']);
  assert.deepEqual(c.expertise, ['stealth']);
});

test('proficiency predicates read the lists, defaulting for legacy characters', () => {
  const legacy = {
    ...createCharacter('c1', 'Nim'),
    proficiencies: undefined,
    expertise: undefined,
  };
  assert.equal(isProficientSave(legacy, 'DEX'), false);
  assert.equal(isProficientSkill(legacy, 'stealth'), false);
  assert.equal(hasExpertise(legacy, 'stealth'), false);
  assert.deepEqual(getProficiencies(legacy), emptyProficiencies());

  const c = withExpertise(
    withProficiencies(createCharacter('c2', 'Vex'), { saves: ['DEX'], skills: ['stealth'] }),
    ['stealth'],
  );
  assert.equal(isProficientSave(c, 'DEX'), true);
  assert.equal(isProficientSave(c, 'STR'), false);
  assert.equal(isProficientSkill(c, 'stealth'), true);
  assert.equal(hasExpertise(c, 'stealth'), true);
  assert.equal(hasExpertise(c, 'perception'), false);
});

test('withDefaults fills empty lists on a pre-proficiency save and keeps stored ones', () => {
  const legacy = withDefaults({ id: 'c1', name: 'Old', level: 3, resources: [] });
  assert.deepEqual(legacy.proficiencies, emptyProficiencies());
  assert.deepEqual(legacy.expertise, []);

  const c = withExpertise(withProficiencies(rogueElf(), assembleProficiencies(rogueElf())), [
    'stealth',
  ]);
  const loaded = withDefaults(JSON.parse(JSON.stringify(c)));
  assert.deepEqual(loaded.proficiencies, c.proficiencies);
  assert.deepEqual(loaded.expertise, ['stealth']);
});
