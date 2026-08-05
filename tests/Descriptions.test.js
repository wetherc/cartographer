import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SKILL_IDS, skillDescription } from '../src/data/skills.js';
import { abilityDescription, abilityName } from '../src/data/abilities.js';
import { ABILITY_SCORES } from '../src/entities/Modifiers.js';

test('every skill has a reference line', () => {
  for (const id of SKILL_IDS) {
    assert.ok(skillDescription(id).length > 0, `${id} has no description`);
  }
});

test('every ability has a name and a reference line', () => {
  for (const key of ABILITY_SCORES) {
    assert.notEqual(abilityName(key), key, `${key} has no full name`);
    assert.ok(abilityDescription(key).length > 0, `${key} has no description`);
  }
});

test('an unknown key reads as itself with no line', () => {
  assert.equal(abilityName('LUCK'), 'LUCK');
  assert.equal(abilityDescription('LUCK'), '');
  assert.equal(skillDescription('haggling'), '');
});
