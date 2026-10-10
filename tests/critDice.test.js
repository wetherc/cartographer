import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extraCritDice } from '../src/entities/Features.js';
import { damageParts } from '../src/combat/AttackResolve.js';
import { createCharacter } from '../src/entities/Character.js';
import { hitDamage, prepareSwing } from '../src/combat/WeaponSwing.js';

const AXE = {
  id: 'axe',
  name: 'Greataxe',
  quantity: 1,
  notes: '',
  type: /** @type {const} */ ('weapon'),
  kind: /** @type {const} */ ('melee'),
  properties: /** @type {any} */ ([]),
  damage: [{ count: 1, sides: 12, damageType: 'slashing' }],
};
const BOW = { ...AXE, id: 'bow', name: 'Longbow', kind: /** @type {const} */ ('ranged') };
const SAVAGE = { traits: ['Relentless Endurance', 'Savage Attacks'] };

/** @param {number} level @param {object} [extra] */
const barbarian = (level, extra = {}) => ({
  .../** @type {any} */ (createCharacter('Brunn')),
  classes: [{ classId: 'barbarian', level }],
  level,
  ...extra,
});

test('Brutal Critical adds 1, 2, and 3 dice at barbarian 9, 13, and 17', () => {
  assert.deepEqual(
    [1, 8, 9, 12, 13, 16, 17, 20].map((level) => extraCritDice(barbarian(level))),
    [0, 0, 1, 1, 2, 2, 3, 3],
  );
});

test('Savage Attacks adds one die, and stacks with Brutal Critical', () => {
  assert.equal(extraCritDice(barbarian(1, { raceTraits: SAVAGE })), 1);
  assert.equal(extraCritDice(barbarian(13, { raceTraits: SAVAGE })), 3);
  assert.equal(extraCritDice(barbarian(1, { raceTraits: { traits: [] } })), 0);
  assert.equal(extraCritDice(/** @type {any} */ ({ name: 'Orc' })), 0, 'a creature');
});

test('damageParts adds the extra dice once, of the first weapon die, on a crit only', () => {
  const weapon = [
    { count: 1, sides: 12, damageType: 'slashing' },
    { count: 1, sides: 6, damageType: 'fire' },
  ];
  assert.deepEqual(damageParts(weapon, { crit: true, critDice: 2 }), [
    { count: 2, sides: 12, damageType: 'slashing' },
    { count: 2, sides: 6, damageType: 'fire' },
    { count: 2, sides: 12, damageType: 'slashing' },
  ]);
  assert.deepEqual(damageParts(weapon, { crit: false, critDice: 2 }), weapon);
  assert.deepEqual(damageParts([], { crit: true, critDice: 2 }), []);
});

test('a melee crit adds the extra dice and names them, and a ranged crit does not', () => {
  const defender = { name: 'Orc', ac: 10, conditions: [] };
  /** @param {any} attacker @param {any} weapon @param {boolean} crit */
  const swing = (attacker, weapon, crit) => {
    const setup = prepareSwing({ attacker, defender, weapon, tweaks: {}, rng: () => 0 });
    return hitDamage(setup, { attacker, defender, weapon, tweaks: {}, crit, rng: () => 0 });
  };
  const orc = barbarian(9, { raceTraits: SAVAGE });
  const plain = barbarian(1);
  // Every die rolls a 1 at rng 0, so the dice count shows in the total.
  assert.equal(swing(orc, AXE, true).damage.total - swing(plain, AXE, true).damage.total, 2);
  assert.match(swing(orc, AXE, true).riderNote, /, extra critical dice \+2d12$/);
  assert.equal(swing(orc, AXE, false).damage.total, swing(plain, AXE, false).damage.total);
  assert.equal(swing(orc, BOW, true).damage.total, swing(plain, BOW, true).damage.total);
  assert.equal(swing(orc, { ...AXE, damage: [] }, true).riderNote, '');
});
