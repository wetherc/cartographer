import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSummons } from '../src/app/summons.js';
import { stubApp as baseStubApp } from './helpers/app.js';

/**
 * The spawn half of summoning. The despawn half is asserted through
 * `endSpellEffects` in combatants.test.js, and the whole cast is asserted in
 * spellCast.test.js. This suite covers what only a direct call reaches: the
 * missing-template path, and the initiative a summon joins a fight on.
 */

const HERE = { nodeId: 'n1', tileId: '0,0' };

/** @param {{ creatures?: any[], combat?: any }} [state] */
function stubApp(state = {}) {
  return baseStubApp({
    state,
    partyTracker: /** @type {any} */ ({ getPosition: () => HERE }),
  });
}

const conjure = /** @type {any} */ ({ id: 'conjure-animals', name: 'Conjure Animals' });

test('a spawn reports a template the library no longer carries', () => {
  const app = stubApp();
  // The cast dialog blocks this, so only a library edited while the dialog sat
  // open reaches it. The slot is already spent, so the caller shows the message.
  const result = spawnSummons(app, conjure, 'druid', { creature: 'Owlbear', count: 2 });
  assert.deepEqual(result, { error: 'No creature template named "Owlbear".' });
  assert.deepEqual(app.state.creatures, [], 'nothing lands when nothing matched');
});

test('a spawn matches a template name whatever its case and spacing', () => {
  const app = stubApp();
  const result = spawnSummons(app, conjure, 'druid', { creature: '  wOLf  ', count: 1 });
  assert.equal('error' in result, false);
  assert.equal(app.state.creatures.length, 1);
  assert.equal(app.state.creatures[0].name, 'Wolf');
});

test('a summon joins a running fight on a d20 plus its DEX modifier', () => {
  const app = stubApp({ combat: { round: 1, index: 0, order: [], startedAt: 0 } });
  /** @type {any[]} */
  const joined = [];
  app.actions.addCombatant = (/** @type {any} */ p) => joined.push(p);
  // The Wolf template has DEX 15, a +2 modifier. A max roll is 20 + 2.
  spawnSummons(app, conjure, 'druid', { creature: 'Wolf', count: 1 }, { rng: () => 0.999 });
  assert.equal(joined.length, 1);
  assert.equal(joined[0].modifier, 2);
  assert.equal(joined[0].initiative, 22);
  assert.equal(joined[0].id, app.state.creatures[0].id);
});

test('a summon out of combat joins no order', () => {
  const app = stubApp();
  spawnSummons(app, conjure, 'druid', { creature: 'Wolf', count: 1 });
  assert.equal(app.calls.includes('addCombatant'), false);
});
