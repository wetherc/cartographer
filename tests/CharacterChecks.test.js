import { test } from 'node:test';
import assert from 'node:assert/strict';
import { training, saveRows, skillRows } from '../src/ui/CharacterChecks.js';
import { createCharacter } from '../src/entities/Character.js';
import { withProficiencies, withExpertise } from '../src/entities/Proficiencies.js';
import { SKILL_IDS } from '../src/data/skills.js';

/** A level-5 character with a CON of 16 (+3), DEX of 12 (+1), and WIS of 8 (-1). */
function hero() {
  const base = createCharacter('c1', 'Rook');
  return /** @type {any} */ ({
    ...base,
    level: 5,
    stats: { ...base.stats, CON: 16, DEX: 12, WIS: 8 },
  });
}

/** The hero, proficient in the CON save and in Stealth and Perception, with
 * expertise in Stealth. */
function expert() {
  const proficient = withProficiencies(hero(), {
    saves: ['CON'],
    skills: ['stealth', 'perception'],
  });
  return withExpertise(proficient, ['stealth']);
}

/**
 * One row out of a list, by key.
 * @param {ReturnType<typeof saveRows>} rows
 * @param {string} key
 */
function row(rows, key) {
  const found = rows.find((r) => r.key === key);
  assert.ok(found, `no row for ${key}`);
  return found;
}

test('every save gets a row, whether the class grants it or not', () => {
  const rows = saveRows(hero());
  assert.deepEqual(
    rows.map((r) => r.key),
    ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'],
  );
  assert.ok(
    rows.every((r) => r.kind === 'save' && r.name === r.ability && r.expert === false),
    'a save row names its own ability and never carries expertise',
  );
});

test('a save row carries the bonus and the proficiency behind it', () => {
  const rows = saveRows(expert());
  assert.equal(row(rows, 'CON').bonus, 6, 'a +3 modifier plus a +3 proficiency bonus');
  assert.equal(row(rows, 'CON').proficient, true);
  assert.equal(row(rows, 'WIS').bonus, -1);
  assert.equal(row(rows, 'WIS').proficient, false);
});

test('every skill gets a row, in the skill table order', () => {
  const rows = skillRows(hero());
  assert.deepEqual(
    rows.map((r) => r.key),
    SKILL_IDS,
  );
  assert.ok(
    rows.every((r) => r.kind === 'check'),
    'a skill row resolves as a check',
  );
});

test('a skill row names the skill and the ability it rolls', () => {
  const rows = skillRows(hero());
  assert.equal(row(rows, 'sleight-of-hand').name, 'Sleight of Hand');
  assert.equal(row(rows, 'sleight-of-hand').ability, 'DEX');
  assert.equal(row(rows, 'animal-handling').ability, 'WIS');
});

test('a skill row carries the bonus, the proficiency, and the expertise', () => {
  const rows = skillRows(expert());
  // A DEX of 12 is +1, and a level-5 proficiency bonus is +3, doubled by expertise.
  const stealth = row(rows, 'stealth');
  assert.equal(stealth.bonus, 7);
  assert.equal(stealth.proficient, true);
  assert.equal(stealth.expert, true);
  // A WIS of 8 is -1, plus the undoubled proficiency bonus.
  const perception = row(rows, 'perception');
  assert.equal(perception.bonus, 2);
  assert.equal(perception.proficient, true);
  assert.equal(perception.expert, false);
  const arcana = row(rows, 'arcana');
  assert.equal(arcana.bonus, 0, 'an untrained skill is the ability modifier alone');
  assert.equal(arcana.proficient, false);
});

test('training reads expertise over proficiency', () => {
  const rows = skillRows(expert());
  assert.equal(training(row(rows, 'stealth')), 'expert');
  assert.equal(training(row(rows, 'perception')), 'proficient');
  assert.equal(training(row(rows, 'arcana')), 'untrained');
});
