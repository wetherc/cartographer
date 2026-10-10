import { test } from 'node:test';
import assert from 'node:assert/strict';
import { offerResistance, resistSpellSaves } from '../src/app/legendaryResistancePrompt.js';
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

test('resistSpellSaves asks only about a failed save, and passes a skipped target through', async () => {
  const a = app([king, { ...king, id: 'queen', name: 'Queen' }]);
  const skipped = {
    target: { id: 'queen' },
    unaffectedBy: 'over 100 HP',
    saved: true,
    taken: 0,
    condition: null,
  };
  const failed = {
    target: { id: 'king' },
    saved: false,
    dc: 13,
    taken: 0,
    condition: 'Frightened',
  };
  /** @type {string[]} */
  const asked = [];
  const pending = resistSpellSaves(
    a,
    fear,
    { outcomes: [skipped, failed] },
    {
      ask: async (message) => {
        asked.push(message);
        return true;
      },
    },
  );
  const next = await /** @type {Promise<any>} */ (pending);
  assert.equal(asked.length, 1);
  assert.match(asked[0], /DC 13/);
  assert.equal(next.outcomes[0], skipped);
  assert.equal(next.outcomes[1].saved, true);
});

test('resistSpellSaves returns null when nobody can resist', () => {
  const a = app([king]);
  const saved = { outcomes: [{ target: { id: 'king' }, saved: true }] };
  assert.equal(resistSpellSaves(a, fear, saved), null);
  const attack = /** @type {any} */ ({ ...fear, effect: { kind: 'attack' } });
  assert.equal(resistSpellSaves(a, attack, { outcomes: [] }), null);
});
