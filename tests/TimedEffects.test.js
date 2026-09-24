import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ROUNDS_PER_WATCH, elapseCharacter, elapseCreature } from '../src/entities/TimedEffects.js';
import { createCharacter } from '../src/entities/Character.js';
import { createCreature, addStatModifier } from '../src/entities/Creature.js';
import { begin } from '../src/entities/Concentration.js';
import { addCondition, createCondition } from '../src/entities/Conditions.js';
import { watchesBetween } from '../src/time/GameClock.js';

const bless = /** @type {any} */ ({
  id: 'bless',
  name: 'Bless',
  duration: { kind: 'minutes', amount: 1 },
});

test('a watch ends Bless and its concentration, and names the spell that ended', () => {
  let cleric = begin(createCharacter('c1', 'Cleric'), bless, 1).character;
  assert.equal(cleric.concentration?.remaining, 10);
  cleric = { ...cleric, conditions: addCondition(cleric.conditions, 'Blessed', 10) };
  const { character, ended } = elapseCharacter(cleric, ROUNDS_PER_WATCH);
  assert.equal(character.concentration, null);
  assert.deepEqual(character.conditions, []);
  assert.equal(ended?.spellId, 'bless');
});

test('an effect longer than the time passed keeps the rest of its rounds', () => {
  let mage = createCharacter('m1', 'Mage');
  mage = {
    ...mage,
    concentration: { spellId: 'x', spellName: 'X', slotLevel: 1, remaining: 3 * ROUNDS_PER_WATCH },
    conditions: [createCondition('Armored', 2 * ROUNDS_PER_WATCH), createCondition('Cursed')],
  };
  const { character, ended } = elapseCharacter(mage, ROUNDS_PER_WATCH);
  assert.equal(ended, null);
  assert.equal(character.concentration?.remaining, 2 * ROUNDS_PER_WATCH);
  assert.deepEqual(
    character.conditions.map((c) => [c.name, c.rounds]),
    [
      ['Armored', ROUNDS_PER_WATCH],
      ['Cursed', null],
      ['Concentrating', 2 * ROUNDS_PER_WATCH],
    ],
  );
});

test('an entity with nothing timed comes back as the same object', () => {
  const plain = createCharacter('p', 'Plain');
  assert.equal(elapseCharacter(plain, ROUNDS_PER_WATCH).character, plain);
  const open = {
    ...plain,
    concentration: { spellId: 'x', spellName: 'X', slotLevel: 1, remaining: null },
  };
  assert.equal(elapseCharacter(open, ROUNDS_PER_WATCH).character, open);
  const ogre = createCreature('o', 'Ogre');
  assert.equal(elapseCreature(ogre, ROUNDS_PER_WATCH), ogre);
});

test('a creature loses its timed chips and stat modifiers', () => {
  let ogre = addStatModifier(createCreature('o', 'Ogre'), 'AC', 2, 10);
  ogre = { ...ogre, conditions: [createCondition('Held', 10), createCondition('Prone')] };
  const next = elapseCreature(ogre, ROUNDS_PER_WATCH);
  assert.deepEqual(next.statMods, []);
  assert.deepEqual(
    next.conditions.map((c) => c.name),
    ['Prone'],
  );
});

test('watchesBetween counts across days and never goes negative', () => {
  assert.equal(watchesBetween({ day: 1, watch: 4 }, { day: 2, watch: 0 }), 2);
  assert.equal(watchesBetween({ day: 1, watch: 0 }, { day: 1, watch: 3 }), 3);
  assert.equal(watchesBetween({ day: 2, watch: 0 }, { day: 1, watch: 0 }), 0);
});
