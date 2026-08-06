import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  attacksPerAction,
  featureSource,
  hasFeature,
  sneakAttackDice,
} from '../src/entities/Features.js';
import { createCharacter } from '../src/entities/Character.js';

/** @param {{ classId: string, level: number }[]} classes */
function classed(classes) {
  const level = classes.reduce((sum, ref) => sum + ref.level, 0);
  return { ...createCharacter('c1', 'Bron', { STR: 16 }), classes, level };
}

/** @param {string} classId @param {number} level */
const one = (classId, level) => classed([{ classId, level }]);

test('hasFeature matches an unlocked feature by exact name', () => {
  assert.equal(hasFeature(one('rogue', 1), 'Sneak Attack'), true);
  assert.equal(hasFeature(one('rogue', 1), 'Uncanny Dodge'), false, 'not until 5th level');
  assert.equal(hasFeature(one('fighter', 11), 'Extra Attack'), true);
  assert.equal(hasFeature(one('fighter', 5), 'Extra Attack (2)'), false, 'no partial match');
  assert.equal(hasFeature(createCharacter('c1', 'Nim'), 'Extra Attack'), false, 'classless');
});

test('featureSource names the class that granted the feature', () => {
  assert.equal(featureSource(one('barbarian', 5), 'Extra Attack'), 'barbarian');
  assert.equal(featureSource(one('barbarian', 5), 'Sneak Attack'), null);
});

test('featureSource reports the first class in list order for a shared feature', () => {
  const both = classed([
    { classId: 'barbarian', level: 5 },
    { classId: 'fighter', level: 5 },
  ]);
  assert.equal(featureSource(both, 'Extra Attack'), 'barbarian');
});

test('attacksPerAction is one swing without Extra Attack', () => {
  assert.equal(attacksPerAction(one('fighter', 4)), 1);
  assert.equal(attacksPerAction(one('rogue', 20)), 1, 'a Rogue never gets it');
  assert.equal(attacksPerAction(createCharacter('c1', 'Nim')), 1, 'classless');
});

test('attacksPerAction counts Extra Attack and its numbered follow-ups', () => {
  assert.equal(attacksPerAction(one('fighter', 5)), 2);
  assert.equal(attacksPerAction(one('fighter', 11)), 3);
  assert.equal(attacksPerAction(one('fighter', 20)), 4);
  assert.equal(attacksPerAction(one('barbarian', 5)), 2);
});

test('attacksPerAction takes the best count instead of stacking classes', () => {
  const both = classed([
    { classId: 'fighter', level: 11 },
    { classId: 'barbarian', level: 5 },
  ]);
  assert.equal(attacksPerAction(both), 3, 'Extra Attack does not stack');
});

test('sneakAttackDice adds a die at every odd level of the granting class', () => {
  assert.equal(sneakAttackDice(one('rogue', 1)), 1);
  assert.equal(sneakAttackDice(one('rogue', 2)), 1);
  assert.equal(sneakAttackDice(one('rogue', 3)), 2);
  assert.equal(sneakAttackDice(one('rogue', 20)), 10);
});

test('sneakAttackDice reads the Rogue level, not the character level', () => {
  const both = classed([
    { classId: 'fighter', level: 6 },
    { classId: 'rogue', level: 4 },
  ]);
  assert.equal(sneakAttackDice(both), 2);
});

test('sneakAttackDice is zero without the feature', () => {
  assert.equal(sneakAttackDice(one('fighter', 20)), 0);
  assert.equal(sneakAttackDice(createCharacter('c1', 'Nim')), 0);
});

test('sneakAttackDice reads a broken class level as first level', () => {
  const rogue = one('rogue', 1);
  assert.equal(sneakAttackDice({ ...rogue, classes: [{ classId: 'rogue', level: 0 }] }), 1);
});
