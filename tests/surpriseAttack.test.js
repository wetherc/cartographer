import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  attackTraitFields,
  coerceSurpriseAttack,
  surpriseDiceFor,
} from '../src/entities/CreatureAttacks.js';
import { createCreature, withDefaults } from '../src/entities/Creature.js';
import { fromTemplate, toTemplate } from '../src/entities/CreatureTemplate.js';
import { createCharacter, withHP, getHP } from '../src/entities/Character.js';
import { hitDamage, prepareSwing } from '../src/combat/WeaponSwing.js';
import { rollWeaponAttack } from '../src/app/weaponAttack.js';
import { creatureFields, readCreatureFields } from '../src/view/forms/creatureFields.js';
import { gearOptions } from '../src/view/forms/gearFields.js';
import { roll } from '../src/dice/DiceRoller.js';
import { STAT_KEYS } from '../src/entities/Modifiers.js';
import { stubApp } from './helpers/app.js';

const HERE = { nodeId: 'n1', tileId: '0,0' };
const STAR = /** @type {any} */ ({
  name: 'Morningstar',
  kind: 'melee',
  damage: [{ count: 2, sides: 8, damageType: 'piercing' }],
});
const DICE = { count: 2, sides: 6 };
const bugbear = createCreature('bug', 'Bugbear', {
  disposition: 'hostile',
  maxHP: 27,
  location: HERE,
  weapon: STAR,
  surpriseAttack: DICE,
});

test('coerceSurpriseAttack keeps real dice and drops the rest', () => {
  assert.deepEqual(coerceSurpriseAttack({ count: '2', sides: 6 }), DICE);
  assert.equal(coerceSurpriseAttack({ count: 99, sides: 6 })?.count, 10);
  assert.equal(coerceSurpriseAttack({ count: 0, sides: 6 }), undefined);
  assert.equal(coerceSurpriseAttack({ count: 2, sides: 7 }), undefined);
  assert.equal(coerceSurpriseAttack('2d6'), undefined);
  assert.deepEqual(attackTraitFields({ surpriseAttack: DICE }), { surpriseAttack: DICE });
});

test('the creature model keeps Surprise Attack through load and template', () => {
  assert.deepEqual(bugbear.surpriseAttack, DICE);
  assert.deepEqual(withDefaults(bugbear).surpriseAttack, DICE);
  assert.equal('surpriseAttack' in withDefaults({ ...bugbear, surpriseAttack: undefined }), false);
  assert.deepEqual(fromTemplate(toTemplate('t', bugbear), 'b2').surpriseAttack, DICE);
});

const combat = (round, surprised) => ({
  round,
  order: [{ id: 'bug' }, { id: 'hero', ...(surprised ? { surprised: true } : {}) }],
});

test('surpriseDiceFor applies only in round 1 to a surprised defender', () => {
  assert.deepEqual(surpriseDiceFor(bugbear, /** @type {any} */ (combat(1, true)), 'hero'), DICE);
  assert.equal(surpriseDiceFor(bugbear, /** @type {any} */ (combat(2, true)), 'hero'), null);
  assert.equal(surpriseDiceFor(bugbear, /** @type {any} */ (combat(1, false)), 'hero'), null);
  assert.equal(surpriseDiceFor(bugbear, null, 'hero'), null);
  assert.equal(surpriseDiceFor({ name: 'X' }, /** @type {any} */ (combat(1, true)), 'hero'), null);
});

test('hitDamage adds the dice, doubles them on a crit, and names them', () => {
  const target = { id: 'hero', name: 'Hero', ac: 10, conditions: [] };
  const tweaks = { surprise: DICE };
  const setup = prepareSwing({
    attacker: bugbear,
    defender: target,
    weapon: STAR,
    tweaks,
    rng: () => 0,
  });
  const hit = (/** @type {boolean} */ crit) =>
    hitDamage(setup, {
      attacker: bugbear,
      defender: target,
      weapon: STAR,
      tweaks,
      crit,
      rng: () => 0,
    });
  assert.match(hit(false).riderNote, /, Surprise Attack \+2d6$/);
  // Every die rolls a 1 at rng 0, so the dice count shows in the total.
  const plain = hitDamage(setup, {
    attacker: bugbear,
    defender: target,
    weapon: STAR,
    tweaks: {},
    crit: false,
    rng: () => 0,
  });
  assert.equal(hit(false).damage.total - plain.damage.total, 2);
  assert.equal(hit(true).damage.total - plain.damage.total, 6);
});

test('a hit on a surprised hero in round 1 lands the Surprise Attack dice', () => {
  const run = (/** @type {boolean} */ surprised) => {
    const app = stubApp({
      state: /** @type {any} */ ({
        characters: [withHP(createCharacter('hero', 'Hero'), 60)],
        creatures: [bugbear],
        combat: combat(1, surprised),
      }),
      partyTracker: /** @type {any} */ ({ getPosition: () => HERE }),
    });
    app.actions.rollDice = /** @type {any} */ (
      (/** @type {any} */ selection) => ({ result: roll(selection, () => 0.9) })
    );
    rollWeaponAttack(app, {
      attacker: bugbear,
      defender: { id: 'hero', name: 'Hero', ac: 10 },
      weapon: STAR,
      tweaks: { freeAction: true },
      rng: () => 0,
    });
    return { app, hp: getHP(app.state.characters[0]).current };
  };
  const surprised = run(true);
  const plain = run(false);
  assert.equal(plain.hp - surprised.hp, 2);
  assert.ok(surprised.app.log.some((l) => /Surprise Attack \+2d6/.test(l)));
});

test('the creature form fills and reads the Surprise Attack dice', () => {
  const gear = gearOptions(bugbear);
  const fields = creatureFields(bugbear, gear);
  const value = (/** @type {string} */ name) => fields.find((f) => f.name === name)?.value;
  assert.equal(value('surpriseCount'), 2);
  assert.equal(value('surpriseDie'), '6');
  assert.equal(creatureFields(null, gear).find((f) => f.name === 'surpriseCount')?.value, '');
  const values = {
    name: 'Bugbear',
    role: '',
    disposition: 'hostile',
    notes: '',
    maxHP: '27',
    level: '',
    tier: 'mob',
    cr: '',
    weapon: '',
    armor: '',
    casterClass: '',
    surpriseCount: '3',
    surpriseDie: '8',
    ...Object.fromEntries(STAT_KEYS.map((key) => [`stat-${key}`, '10'])),
  };
  assert.deepEqual(readCreatureFields(values, gear).surpriseAttack, { count: 3, sides: 8 });
  assert.equal(
    'surpriseAttack' in readCreatureFields({ ...values, surpriseCount: '' }, gear),
    false,
  );
});
