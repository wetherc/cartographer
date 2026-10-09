import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ROUNDS_PER_WATCH, elapse } from '../src/entities/TimedEffects.js';
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
  const { entity: character, ended } = elapse(cleric, ROUNDS_PER_WATCH);
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
  const { entity: character, ended } = elapse(mage, ROUNDS_PER_WATCH);
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
  assert.equal(elapse(plain, ROUNDS_PER_WATCH).entity, plain);
  const open = {
    ...plain,
    concentration: { spellId: 'x', spellName: 'X', slotLevel: 1, remaining: null },
  };
  assert.equal(elapse(open, ROUNDS_PER_WATCH).entity, open);
  const ogre = createCreature('o', 'Ogre');
  assert.equal(elapse(ogre, ROUNDS_PER_WATCH).entity, ogre);
});

test('a creature loses its timed chips and stat modifiers', () => {
  let ogre = addStatModifier(createCreature('o', 'Ogre'), 'AC', 2, 10);
  ogre = { ...ogre, conditions: [createCondition('Held', 10), createCondition('Prone')] };
  const next = elapse(ogre, ROUNDS_PER_WATCH).entity;
  assert.deepEqual(next.statMods, []);
  assert.deepEqual(
    next.conditions.map((c) => c.name),
    ['Prone'],
  );
});

test('one round keeps the identity of an entity with nothing timed', () => {
  const ogre = { ...createCreature('o', 'Ogre'), conditions: [createCondition('Prone')] };
  assert.deepEqual(elapse(ogre, 1), { entity: ogre, ended: null });
  const plain = createCharacter('p', 'Plain');
  assert.equal(elapse(plain, 1).entity, plain);
  const empty = { ...ogre, statMods: [] };
  assert.equal(elapse(empty, 1).entity, empty);
});

test('one round ticks chips, stat modifiers, and concentration', () => {
  let ogre = addStatModifier(createCreature('o', 'Ogre'), 'AC', 2, 1);
  ogre = { ...ogre, conditions: [createCondition('Held', 2)] };
  const next = elapse(ogre, 1).entity;
  assert.deepEqual(next.statMods, []);
  assert.deepEqual(next.conditions, [createCondition('Held', 1)]);
  const cleric = begin(createCharacter('c1', 'Cleric'), bless, 1).character;
  const once = elapse(cleric, 1);
  assert.equal(once.ended, null);
  assert.equal(once.entity.concentration?.remaining, 9);
  const last = { ...cleric, concentration: { ...cleric.concentration, remaining: 1 } };
  const done = elapse(/** @type {any} */ (last), 1);
  assert.equal(done.ended?.spellId, 'bless');
  assert.equal(done.entity.concentration, null);
});

test('watchesBetween counts across days and never goes negative', () => {
  assert.equal(watchesBetween({ day: 1, watch: 4 }, { day: 2, watch: 0 }), 2);
  assert.equal(watchesBetween({ day: 1, watch: 0 }, { day: 1, watch: 3 }), 3);
  assert.equal(watchesBetween({ day: 2, watch: 0 }, { day: 1, watch: 0 }), 0);
});

test('a watch ends the concentration of a creature, with its chip', () => {
  const witch = begin(createCreature('w', 'Witch'), bless, 1).character;
  assert.equal(witch.concentration?.remaining, 10);
  const { entity, ended } = elapse(witch, ROUNDS_PER_WATCH);
  assert.equal(ended?.spellId, 'bless');
  assert.equal(entity.concentration, null);
  assert.deepEqual(entity.conditions, []);
});

test('one round decrements timed chips, drops the expired, and keeps open ones', () => {
  const list = [
    createCondition('Frightened', 2),
    createCondition('Poisoned', 1),
    createCondition('Prone', null),
  ];
  const ogre = { ...createCreature('o', 'Ogre'), conditions: list };
  assert.deepEqual(elapse(ogre, 1).entity.conditions, [
    createCondition('Frightened', 1),
    createCondition('Prone', null),
  ]);
});
