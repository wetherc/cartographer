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
  isProficientWeapon,
  hasExpertise,
  normalizeProficiencies,
  normalizeWeaponProficiencies,
} from '../src/entities/Proficiencies.js';
import { createCharacter, withDefaults } from '../src/entities/Character.js';
import { withRace, withCustomRace } from '../src/entities/Races.js';
import { withBackground } from '../src/entities/Backgrounds.js';

/** A rogue elf criminal — every grant source populated. */
function rogueElf() {
  const base = withRace(createCharacter('c1', 'Vex'), 'elf');
  return { ...withBackground(base, 'criminal'), classes: [{ classId: 'rogue', level: 1 }] };
}

test('assembleProficiencies gathers fixed grants from class, race, and background', () => {
  const p = assembleProficiencies(rogueElf());
  assert.deepEqual(p.saves, ['DEX', 'INT']);
  assert.deepEqual(p.skills, ['perception', 'deception', 'stealth']);
  assert.deepEqual(p.weapons, {
    categories: ['simple'],
    named: ['hand crossbow', 'longsword', 'rapier', 'shortsword', 'shortbow', 'longbow'],
  });
  assert.deepEqual(p.armor, ['light']);
  assert.deepEqual(p.tools, ['gaming set', "thieves' tools"]);
  assert.deepEqual(p.languages, ['Common', 'Elvish']);
});

test('assembleProficiencies deduplicates overlapping grants', () => {
  const p = assembleProficiencies(rogueElf(), { skills: ['perception', 'acrobatics'] });
  assert.equal(p.skills.filter((s) => s === 'perception').length, 1);
  assert.ok(p.skills.includes('acrobatics'));
  assert.equal(p.weapons.named.filter((w) => w === 'shortsword').length, 1);
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

test('normalizeProficiencies reads an absent set, and an absent list, as empty', () => {
  assert.deepEqual(normalizeProficiencies(), emptyProficiencies());
  assert.deepEqual(normalizeProficiencies({ skills: ['stealth'] }).expertise, []);
});

test('normalizeProficiencies deduplicates every list and prunes expertise', () => {
  const p = normalizeProficiencies({
    saves: ['DEX', 'DEX'],
    skills: ['stealth', 'stealth', 'arcana'],
    expertise: ['stealth', 'stealth', 'perception'],
    tools: ["thieves' tools", "thieves' tools"],
  });
  assert.deepEqual(p.saves, ['DEX']);
  assert.deepEqual(p.skills, ['stealth', 'arcana']);
  assert.deepEqual(p.expertise, ['stealth'], 'perception is not a granted skill');
  assert.deepEqual(p.tools, ["thieves' tools"]);
});

test('withProficiencies prunes expertise whose skill proficiency was removed', () => {
  let c = withProficiencies(createCharacter('c1', 'Nim'), { skills: ['stealth', 'athletics'] });
  c = withExpertise(c, ['stealth', 'athletics']);
  c = withProficiencies(c, { skills: ['athletics'] });
  assert.deepEqual(c.proficiencies.expertise, ['athletics']);
});

test('withProficiencies keeps expertise a patch says nothing about', () => {
  let c = withProficiencies(createCharacter('c1', 'Nim'), { skills: ['stealth'] });
  c = withExpertise(c, ['stealth']);
  c = withProficiencies(c, { skills: ['stealth'], tools: ["thieves' tools"] });
  assert.deepEqual(c.proficiencies.expertise, ['stealth']);
});

test('withProficiencies takes an expertise list the patch does name', () => {
  let c = withProficiencies(createCharacter('c1', 'Nim'), { skills: ['stealth', 'arcana'] });
  c = withExpertise(c, ['stealth']);
  c = withProficiencies(c, { skills: ['stealth', 'arcana'], expertise: ['arcana'] });
  assert.deepEqual(c.proficiencies.expertise, ['arcana']);
});

test('withExpertise deduplicates and filters to proficient skills', () => {
  const proficient = withProficiencies(createCharacter('c1', 'Nim'), { skills: ['stealth'] });
  const c = withExpertise(proficient, ['stealth', 'stealth', 'arcana']);
  assert.deepEqual(c.proficiencies.expertise, ['stealth']);
});

test('withExpertise leaves the other proficiency lists alone', () => {
  const p = withProficiencies(createCharacter('c1', 'Nim'), {
    saves: ['DEX'],
    skills: ['stealth'],
    tools: ["thieves' tools"],
  });
  const c = withExpertise(p, ['stealth']);
  assert.deepEqual(c.proficiencies.saves, ['DEX']);
  assert.deepEqual(c.proficiencies.tools, ["thieves' tools"]);
});

test('proficiency predicates read the lists, defaulting for legacy characters', () => {
  const legacy = { ...createCharacter('c1', 'Nim'), proficiencies: undefined };
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

test('normalizeWeaponProficiencies sorts a flat list into the two namespaces', () => {
  assert.deepEqual(
    normalizeWeaponProficiencies(['simple', 'longsword', 'martial', 'longsword', 'shortbow']),
    { categories: ['simple', 'martial'], named: ['longsword', 'shortbow'] },
  );
  assert.deepEqual(normalizeWeaponProficiencies(undefined), { categories: [], named: [] });
  assert.deepEqual(
    normalizeWeaponProficiencies({ categories: ['martial', 'martial'], named: ['whip', 'whip'] }),
    { categories: ['martial'], named: ['whip'] },
    'an already-split value is deduplicated and passed through',
  );
});

test('isProficientWeapon answers by category or by name', () => {
  const c = withProficiencies(createCharacter('c1', 'Nim'), {
    weapons: { categories: ['simple'], named: ['longsword'] },
  });
  assert.equal(isProficientWeapon(c, 'club', 'simple'), true, 'the whole category is granted');
  assert.equal(isProficientWeapon(c, 'greataxe', 'martial'), false);
  assert.equal(isProficientWeapon(c, 'Longsword', 'martial'), true, 'named beyond the category');
  assert.equal(isProficientWeapon(c, 'greataxe'), false, 'no category to fall back on');
});

test('withProficiencies accepts a flat weapon list and stores it split', () => {
  const c = withProficiencies(createCharacter('c1', 'Nim'), {
    weapons: ['martial', 'dagger'],
  });
  assert.deepEqual(c.proficiencies.weapons, { categories: ['martial'], named: ['dagger'] });
});

test('withDefaults splits a pre-split save whose weapons were one flat list', () => {
  const c = withProficiencies(rogueElf(), assembleProficiencies(rogueElf()));
  const flat = {
    ...JSON.parse(JSON.stringify(c)),
    proficiencies: {
      ...c.proficiencies,
      weapons: ['simple', 'rapier', 'shortsword'],
    },
  };
  assert.deepEqual(withDefaults(flat).proficiencies.weapons, {
    categories: ['simple'],
    named: ['rapier', 'shortsword'],
  });
});

test('withDefaults fills empty lists on a pre-proficiency save and keeps stored ones', () => {
  const legacy = withDefaults({ id: 'c1', name: 'Old', level: 3 });
  assert.deepEqual(legacy.proficiencies, emptyProficiencies());

  const c = withExpertise(withProficiencies(rogueElf(), assembleProficiencies(rogueElf())), [
    'stealth',
  ]);
  const loaded = withDefaults(JSON.parse(JSON.stringify(c)));
  assert.deepEqual(loaded.proficiencies, c.proficiencies);
  assert.deepEqual(loaded.proficiencies.expertise, ['stealth']);
});

test('a save that kept expertise beside the lists loads with it inside them', () => {
  const beside = /** @type {any} */ ({
    id: 'c1',
    name: 'Old',
    level: 3,
    proficiencies: {
      saves: ['DEX'],
      skills: ['stealth', 'arcana'],
      weapons: { categories: ['simple'], named: [] },
      armor: [],
      tools: [],
      languages: [],
    },
    expertise: ['stealth', 'perception'],
  });
  const loaded = withDefaults(beside);
  assert.deepEqual(loaded.proficiencies.expertise, ['stealth'], 'a skill not granted is dropped');
  assert.equal('expertise' in loaded, false, 'the old field does not survive the load');
});

test('a character saved before expertise existed gains an empty expertise list', () => {
  const legacy = /** @type {any} */ ({
    id: 'c1',
    name: 'Old',
    level: 3,
    stats: {},
    resources: [],
    inventory: [],
    conditions: [],
  });
  const next = withProficiencies(legacy, { skills: ['stealth'] });
  assert.deepEqual(next.proficiencies.expertise, []);
  assert.deepEqual(getProficiencies(next).skills, ['stealth']);
});
