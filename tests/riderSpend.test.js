import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spendOnceChips, spendRollRiders } from '../src/app/riderSpend.js';
import { createCreature } from '../src/entities/Creature.js';
import { stubApp } from './helpers/app.js';

const guidance = { name: 'Guidance', rider: { rolls: ['check'], dice: 1, die: 'd4', once: true } };
const bless = { name: 'Bless', rider: { rolls: ['check'], dice: 1, die: 'd4' } };

/** An app with one creature that has Guidance and Bless. */
function withOgre() {
  const ogre = { ...createCreature('ogre', 'Ogre', { maxHP: 30 }), conditions: [guidance, bless] };
  return stubApp({ state: /** @type {any} */ ({ creatures: [ogre] }) });
}

test('spendRollRiders removes a used-up chip from a creature', () => {
  const app = withOgre();
  spendRollRiders(app, 'ogre', { spent: ['Guidance'] });
  assert.deepEqual(
    app.state.creatures[0].conditions.map((/** @type {any} */ c) => c.name),
    ['Bless'],
  );
  assert.equal(app.dirty, 1);
});

test('spendRollRiders writes nothing for no spend, an unknown id, and an unknown id', () => {
  const app = withOgre();
  const before = app.state.creatures;
  spendRollRiders(app, 'ogre', null);
  spendRollRiders(app, 'ogre', { spent: [] });
  spendRollRiders(app, 'nobody', { spent: ['Guidance'] });
  assert.equal(app.state.creatures, before);
  assert.equal(app.dirty, 0);
});

test('spendRollRiders keeps a chip that is not a one-roll rider', () => {
  const app = withOgre();
  spendRollRiders(app, 'ogre', { spent: ['Bless'] });
  assert.deepEqual(
    app.state.creatures[0].conditions.map((/** @type {any} */ c) => c.name),
    ['Guidance', 'Bless'],
  );
});

test('spendRollRiders writes nothing when no chip of the spent name is a one-roll rider', () => {
  const app = withOgre();
  const before = app.state.creatures;
  spendRollRiders(app, 'ogre', { spent: ['Bless'] });
  assert.equal(app.state.creatures, before);
  assert.equal(app.dirty, 0);
});

test('spendOnceChips skips an id that resolves to nothing and a chip the live entity lost', () => {
  const marked = { name: 'Guiding Bolt', mods: { attacksAgainst: 'advantage', once: true } };
  const app = withOgre();
  const before = app.state.creatures;
  // The query read a Guiding Bolt chip that the live ogre no longer has.
  spendOnceChips(app, 'nobody', 'ogre', { roller: [], target: [marked] });
  // The target of this roll is not in the fight at all.
  spendOnceChips(app, 'ogre', 'nobody', { roller: [], target: [marked] });
  assert.equal(app.state.creatures, before);
  assert.equal(app.dirty, 0);
  assert.deepEqual(app.log, []);
});
