import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canResist,
  resistancesLeft,
  resistedOutcome,
  restoreAllResistance,
  restoreResistance,
  spendResistance,
} from '../src/combat/LegendaryResistance.js';
import { createCreature } from '../src/entities/Creature.js';

const HERE = { nodeId: 'n1', tileId: '0,0' };

const king = createCreature('king', 'King', {
  disposition: 'hostile',
  maxHP: 60,
  location: HERE,
  level: 5,
  legendaryResistance: 2,
});

test('resistancesLeft counts the uses left today', () => {
  assert.equal(resistancesLeft(king), 2);
  assert.equal(resistancesLeft({ ...king, legendaryResistanceUsed: 1 }), 1);
  assert.equal(resistancesLeft({ ...king, legendaryResistanceUsed: 9 }), 0);
  assert.equal(resistancesLeft({ ...king, legendaryResistanceUsed: -2 }), 2);
  assert.equal(resistancesLeft({}), 0, 'a creature without the trait has none');
});

test('spendResistance spends one use and stops at the last', () => {
  const once = spendResistance(king);
  assert.equal(once.legendaryResistanceUsed, 1);
  const twice = spendResistance(once);
  assert.equal(resistancesLeft(twice), 0);
  assert.equal(spendResistance(twice), twice);
});

test('restoreResistance gives every use back, and keeps an unspent creature as it is', () => {
  const spent = spendResistance(king);
  assert.equal(resistancesLeft(restoreResistance(spent)), 2);
  assert.equal('legendaryResistanceUsed' in restoreResistance(spent), false);
  assert.equal(restoreResistance(king), king);
});

test('canResist takes only a failed save that rolled or that a chip failed', () => {
  assert.equal(canResist({ saved: false }), true);
  assert.equal(canResist({ saved: true }), false);
  assert.equal(canResist({ saved: false, unaffectedBy: 'over 20 HP' }), false);
  assert.equal(canResist({ saved: false, noRoll: true }), false);
});

test('resistedOutcome halves the damage of a half-on-save spell and drops the condition', () => {
  const failed = {
    saved: false,
    taken: 9,
    damage: { total: 9 },
    condition: 'Frightened',
    conditionRider: 'x',
    ongoing: [{ count: 1 }],
  };
  const half = resistedOutcome({ halfOnSave: true }, failed);
  assert.deepEqual(
    { saved: half.saved, taken: half.taken, condition: half.condition, resisted: half.resisted },
    { saved: true, taken: 4, condition: null, resisted: true },
  );
  assert.equal('ongoing' in half, false);
  assert.equal(resistedOutcome({}, failed).taken, 0);
  assert.equal(resistedOutcome({}, { saved: false }).taken, 0);
});

test('restoreAllResistance refills each creature, and keeps a list with nothing spent', () => {
  const goblin = createCreature('gob', 'Goblin', { disposition: 'hostile', maxHP: 7 });
  const rested = restoreAllResistance([spendResistance(king), goblin]);
  assert.equal(resistancesLeft(rested[0]), 2);
  assert.equal(rested[1], goblin);
  const fresh = [king, goblin];
  assert.equal(restoreAllResistance(fresh), fresh, 'no use spent returns the same list');
});

test('a resisted save of a target with Evasion takes no damage', () => {
  const turned = resistedOutcome(
    { halfOnSave: true },
    { saved: false, evaded: true, taken: 5, damage: { total: 10 } },
  );
  assert.equal(turned.taken, 0);
});
