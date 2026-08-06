import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  abilityModOf,
  attackerStats,
  damageModifier,
  damageParts,
  droppedNote,
  resolveAttack,
} from '../src/combat/AttackResolve.js';
import { createCharacter, addItem } from '../src/entities/Character.js';
import { equip } from '../src/entities/Equipment.js';
import { createCreature } from '../src/entities/Creature.js';

/** @param {number} count @param {number} sides @param {string} damageType */
function part(count, sides, damageType) {
  return { count, sides, damageType };
}

test('a natural 20 hits and crits however high the AC', () => {
  assert.deepEqual(resolveAttack({ natural: 20, total: 22, ac: 30 }), {
    crit: true,
    hit: true,
    outcome: 'critical hit',
  });
});

test('a natural 1 misses however high the total', () => {
  assert.deepEqual(resolveAttack({ natural: 1, total: 40, ac: 10 }), {
    crit: false,
    hit: false,
    outcome: 'natural 1, miss',
  });
});

test('any other roll compares the total against AC, meeting it as a hit', () => {
  assert.equal(resolveAttack({ natural: 12, total: 15, ac: 15 }).hit, true);
  assert.equal(resolveAttack({ natural: 12, total: 15, ac: 15 }).outcome, 'hit');
  assert.equal(resolveAttack({ natural: 12, total: 14, ac: 15 }).hit, false);
  assert.equal(resolveAttack({ natural: 12, total: 14, ac: 15 }).outcome, 'miss');
});

test('autoCrit turns an ordinary hit into a critical one', () => {
  assert.deepEqual(resolveAttack({ natural: 12, total: 15, ac: 15, autoCrit: true }), {
    crit: true,
    hit: true,
    outcome: 'critical hit',
  });
});

test('autoCrit never rescues a miss', () => {
  assert.deepEqual(resolveAttack({ natural: 12, total: 9, ac: 15, autoCrit: true }), {
    crit: false,
    hit: false,
    outcome: 'miss',
  });
  assert.deepEqual(resolveAttack({ natural: 1, total: 40, ac: 10, autoCrit: true }), {
    crit: false,
    hit: false,
    outcome: 'natural 1, miss',
  });
});

test('a crit doubles every damage die and leaves the terms otherwise alone', () => {
  const weapon = [part(1, 8, 'slashing'), part(1, 6, 'fire')];
  assert.deepEqual(damageParts(weapon, { crit: true }), [
    part(2, 8, 'slashing'),
    part(2, 6, 'fire'),
  ]);
  // The originals are untouched, so a re-roll of the same weapon is unaffected.
  assert.deepEqual(weapon, [part(1, 8, 'slashing'), part(1, 6, 'fire')]);
});

test('an ordinary hit passes the weapon terms straight through', () => {
  const weapon = [part(1, 8, 'slashing')];
  assert.deepEqual(damageParts(weapon, { crit: false }), weapon);
});

test("the dialog's bonus dice take the weapon's damage type and double on a crit", () => {
  const weapon = [part(1, 8, 'slashing')];
  assert.deepEqual(damageParts(weapon, { crit: false, bonusDice: 2, bonusDie: 'd6' }), [
    part(1, 8, 'slashing'),
    part(2, 6, 'slashing'),
  ]);
  assert.deepEqual(damageParts(weapon, { crit: true, bonusDice: 2, bonusDie: 'd6' }), [
    part(2, 8, 'slashing'),
    part(4, 6, 'slashing'),
  ]);
});

test('bonus dice on a weapon with no damage of its own are typed as bonus', () => {
  assert.deepEqual(damageParts([], { crit: false, bonusDice: 1, bonusDie: 'd4' }), [
    part(1, 4, 'bonus'),
  ]);
});

test('a zero, negative, or fractional bonus-dice count adds no term', () => {
  const weapon = [part(1, 8, 'slashing')];
  assert.deepEqual(damageParts(weapon, { crit: false, bonusDice: 0 }), weapon);
  assert.deepEqual(damageParts(weapon, { crit: false, bonusDice: -3 }), weapon);
  assert.deepEqual(damageParts(weapon, { crit: false, bonusDice: 0.5 }), weapon);
});

test('sneak attack dice are d6 of the weapon type and double on a crit', () => {
  const weapon = [part(1, 8, 'slashing')];
  assert.deepEqual(damageParts(weapon, { crit: false, sneakDice: 3 }), [
    part(1, 8, 'slashing'),
    part(3, 6, 'slashing'),
  ]);
  assert.deepEqual(damageParts(weapon, { crit: true, sneakDice: 3 }), [
    part(2, 8, 'slashing'),
    part(6, 6, 'slashing'),
  ]);
  assert.deepEqual(damageParts(weapon, { crit: false, sneakDice: 0 }), weapon);
});

test('sneak attack dice sit after the dialog dice, not instead of them', () => {
  assert.deepEqual(
    damageParts([part(1, 8, 'slashing')], {
      crit: false,
      bonusDice: 2,
      bonusDie: 'd8',
      sneakDice: 1,
    }),
    [part(1, 8, 'slashing'), part(2, 8, 'slashing'), part(1, 6, 'slashing')],
  );
});

test('the default bonus die is a d4, matching the dialog', () => {
  assert.deepEqual(damageParts([], { crit: false, bonusDice: 1 }), [part(1, 4, 'bonus')]);
});

test('damage takes the ability modifier plus the flat rider, and ignores nonsense', () => {
  assert.equal(damageModifier(3, '2'), 5);
  assert.equal(damageModifier(3, -1), 2);
  assert.equal(damageModifier(3, ''), 3);
  assert.equal(damageModifier(3, 'smite'), 3);
  assert.equal(damageModifier(-1, undefined), -1);
});

test('an absent ability score rolls as a flat +0 rather than NaN', () => {
  assert.equal(abilityModOf({ STR: 16 }, 'STR'), 3);
  assert.equal(abilityModOf({ STR: 16 }, 'DEX'), 0);
  assert.equal(abilityModOf({}, 'STR'), 0);
});

test('an ordinary roll drops nothing and gets no note', () => {
  assert.equal(droppedNote({ dropped: [] }, 'advantage'), '');
  assert.equal(droppedNote({}, 'advantage'), '');
  assert.equal(droppedNote(undefined, 'advantage'), '');
});

test('an advantage roll names the die it threw away', () => {
  assert.equal(droppedNote({ dropped: [4] }, 'advantage'), ' at advantage (dropped 4)');
  assert.equal(droppedNote({ dropped: [4, 2] }, 'disadvantage'), ' at disadvantage (dropped 4,2)');
});

test("a character's stats come from equipped gear, a creature's from its stat block", () => {
  let hero = createCharacter('h1', 'Mirelle', { STR: 10, DEX: 14 });
  hero = addItem(hero, {
    id: 'ring',
    name: 'Ring of Might',
    quantity: 1,
    notes: '',
    type: 'ring',
    statBonuses: { STR: 4 },
  });
  hero = equip(hero, 'accessory', 'ring');
  assert.equal(attackerStats(hero).STR, 14);

  const foe = createCreature('e1', 'Ogre', {
    disposition: 'hostile',
    maxHP: 59,
    stats: { STR: 19 },
  });
  assert.equal(attackerStats(foe).STR, 19);
});

test("attackerStats folds a creature's worn armor into its AC", () => {
  const guard = createCreature('n1', 'Guard', {
    stats: { STR: 15, AC: 12 },
    armor: { name: 'Shield', acBonus: 2 },
  });
  assert.equal(attackerStats(guard).STR, 15);
  assert.equal(attackerStats(guard).AC, 14);
});
