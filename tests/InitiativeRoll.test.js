import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initiativeSlant, rollInitiative } from '../src/combat/InitiativeRoll.js';
import { createParticipant } from '../src/combat/Initiative.js';
import { createCharacter } from '../src/entities/Character.js';

/** A participant with the given DEX modifier. */
const at = (modifier = 3) => createParticipant('c1', 10 + modifier, modifier);

/** An rng that hands back one d20 face per call, then repeats the last one. */
function faces(values) {
  let i = 0;
  return () => {
    const face = values[Math.min(i++, values.length - 1)];
    return (face - 1) / 20 + 1e-9;
  };
}

/** A character, with anything the test needs written over the defaults. */
function hero(over = {}) {
  return /** @type {any} */ ({ ...createCharacter('c1', 'Rook'), ...over });
}

/** The hero in heavy armor its empty proficiency lists do not cover. */
const armored = (over = {}) =>
  hero({
    inventory: [
      { id: 'plate', name: 'Plate', type: 'armor', armorWeight: 'heavy', baseAC: 18, quantity: 1 },
    ],
    equipment: { chest: 'plate' },
    ...over,
  });

test('an unslanted roll is one d20 plus the DEX modifier, with no note', () => {
  assert.deepEqual(rollInitiative(at(3), hero(), faces([14])), { value: 17, note: '' });
});

test('a missing entity still rolls, so the GM can start the fight', () => {
  assert.deepEqual(rollInitiative(at(2), null, faces([9])), { value: 11, note: '' });
  assert.deepEqual(rollInitiative(at(0), undefined, faces([9])), { value: 9, note: '' });
});

test('a check chip slants the roll and the note names it', () => {
  const rolled = rollInitiative(
    at(3),
    hero({ conditions: [{ name: 'Poisoned' }] }),
    faces([14, 6]),
  );
  assert.equal(rolled.value, 9, 'the lower d20 plus DEX +3');
  assert.equal(rolled.note, 'at disadvantage (dropped 14), Poisoned disadvantage');
});

test('armor the roller is not trained for slants the roll, because initiative is a DEX check', () => {
  const rolled = rollInitiative(at(3), armored(), faces([14, 6]));
  assert.equal(rolled.value, 9);
  assert.equal(
    rolled.note,
    'at disadvantage (dropped 14), not proficient with heavy armor, disadvantage',
  );
});

test('a chip the rules table does not know leaves the roll alone', () => {
  const rolled = rollInitiative(
    at(1),
    hero({ conditions: [{ name: 'Inspired' }] }),
    faces([4, 18]),
  );
  assert.equal(rolled.value, 5, 'the first d20 only, so the second face is never asked for');
  assert.equal(rolled.note, '');
});

test('exhaustion takes its penalty off the total and the note states the level', () => {
  const rolled = rollInitiative(at(3), hero({ exhaustion: 2 }), faces([14]));
  assert.equal(rolled.value, 13, 'd20 14 plus DEX +3 less 4 for two levels');
  assert.equal(rolled.note, 'exhaustion 2 -4');
});

test('a chip and untrained armor cancel against nothing and roll once', () => {
  const rolled = rollInitiative(
    at(0),
    armored({ conditions: [{ name: 'Poisoned' }] }),
    faces([14, 6]),
  );
  assert.equal(rolled.value, 6, 'two disadvantage slants are still one disadvantage roll');
  assert.match(rolled.note, /Poisoned disadvantage, not proficient with heavy armor/);
});

test('initiativeSlant reports the mode, the penalty, and every reason', () => {
  assert.deepEqual(initiativeSlant(hero()), { mode: null, penalty: 0, reasons: [] });
  assert.deepEqual(initiativeSlant(hero({ exhaustion: 1, conditions: [{ name: 'Frightened' }] })), {
    mode: 'disadvantage',
    penalty: -2,
    reasons: ['Frightened disadvantage', 'exhaustion 1 -2'],
  });
});

test('a creature is never untrained for what it wears', () => {
  // A creature carries no proficiency lists, and its attack bonus bakes
  // proficiency in, so nothing it wears slants its initiative.
  const creature = /** @type {any} */ ({
    id: 'g1',
    name: 'Goblin',
    inventory: [{ id: 'plate', name: 'Plate', type: 'armor', armorWeight: 'heavy', baseAC: 18 }],
    equipment: { chest: 'plate' },
  });
  assert.deepEqual(rollInitiative(at(2), creature, faces([11])), { value: 13, note: '' });
});
