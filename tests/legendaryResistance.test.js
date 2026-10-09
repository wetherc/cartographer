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
import { offerResistance, resistSpellSaves } from '../src/app/legendaryResistance.js';
import { createCreature } from '../src/entities/Creature.js';
import { stubApp } from './helpers/app.js';

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

/** @param {any[]} creatures */
function app(creatures) {
  return stubApp({ state: /** @type {any} */ ({ creatures }) });
}

test('offerResistance spends a use and logs it on a yes', async () => {
  const a = app([king]);
  /** @type {string[]} */
  const asked = [];
  const yes = await offerResistance(a, 'king', 'King fails.', {
    ask: async (message) => {
      asked.push(message);
      return true;
    },
  });
  assert.equal(yes, true);
  assert.deepEqual(asked, ['King fails. Use legendary resistance? 2 left today.']);
  assert.equal(a.state.creatures[0].legendaryResistanceUsed, 1);
  assert.match(
    a.log.at(-1),
    /King uses legendary resistance and succeeds instead \(1 left today\)/,
  );
});

test('offerResistance on a no, or with no use left, changes nothing', async () => {
  const a = app([king]);
  assert.equal(await offerResistance(a, 'king', 'x', { ask: async () => false }), false);
  assert.equal(a.state.creatures[0].legendaryResistanceUsed, undefined);
  const spent = app([{ ...king, legendaryResistanceUsed: 2 }]);
  let asked = false;
  const ask = async () => (asked = true);
  assert.equal(await offerResistance(spent, 'king', 'x', { ask }), false);
  assert.equal(asked, false, 'no use left asks nothing');
  assert.equal(await offerResistance(app([]), 'nobody', 'x', { ask }), false);
});

const fear = /** @type {any} */ ({
  id: 'fear',
  name: 'Fear',
  effect: { kind: 'save', saveAbility: 'WIS', condition: 'Frightened' },
});

test('resistSpellSaves turns a failed save of a legendary target into a success', async () => {
  const a = app([king, createCreature('gob', 'Goblin', { disposition: 'hostile', maxHP: 7 })]);
  const result = {
    outcomes: [
      { target: { id: 'king' }, saved: false, dc: 13, taken: 0, condition: 'Frightened' },
      { target: { id: 'gob' }, saved: false, dc: 13, taken: 0, condition: 'Frightened' },
    ],
  };
  const pending = resistSpellSaves(a, fear, result, { ask: async () => true });
  assert.ok(pending);
  const next = await pending;
  assert.equal(next.outcomes[0].saved, true);
  assert.equal(next.outcomes[0].condition, null);
  assert.equal(next.outcomes[1], result.outcomes[1], 'the goblin has no legendary resistance');
});

test('resistSpellSaves returns null when nobody can resist', () => {
  const a = app([king]);
  const saved = { outcomes: [{ target: { id: 'king' }, saved: true }] };
  assert.equal(resistSpellSaves(a, fear, saved), null);
  const attack = /** @type {any} */ ({ ...fear, effect: { kind: 'attack' } });
  assert.equal(resistSpellSaves(a, attack, { outcomes: [] }), null);
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
