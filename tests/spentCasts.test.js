import { test } from 'node:test';
import assert from 'node:assert/strict';
import { endIfSpent, endSpentCasts } from '../src/app/spentCasts.js';
import { spendRollRiders } from '../src/app/riderSpend.js';
import { createCharacter } from '../src/entities/Character.js';
import { createCreature } from '../src/entities/Creature.js';
import { stubApp } from './helpers/app.js';

const source = (/** @type {string} */ casterId) => ({
  casterId,
  spellId: 'guidance',
  spellName: 'Guidance',
});
const guidance = (/** @type {string} */ casterId) => ({
  name: 'Guidance',
  rider: { rolls: ['check'], dice: 1, die: 'd4', once: true },
  source: source(casterId),
});
const concentrating = { spellId: 'guidance', spellName: 'Guidance', slotLevel: 0, remaining: 10 };

/** A cleric concentrating on Guidance cast on a fighter. */
function party(/** @type {any} */ clericExtra = {}) {
  const cleric = {
    ...createCharacter('cleric', 'Cleric'),
    concentration: concentrating,
    conditions: [{ name: 'Concentrating' }],
    ...clericExtra,
  };
  const fighter = { ...createCharacter('fighter', 'Fighter'), conditions: [guidance('cleric')] };
  return stubApp({ state: /** @type {any} */ ({ characters: [cleric, fighter], creatures: [] }) });
}

test('spending the last chip of a cast ends the caster concentration', () => {
  const app = party();
  spendRollRiders(app, 'fighter', { spent: ['Guidance'] });
  const cleric = app.state.characters[0];
  assert.equal(cleric.concentration, null);
  assert.deepEqual(cleric.conditions, []);
  assert.match(app.log.join('\n'), /Cleric stops concentrating on Guidance\./);
});

test('a chip of the cast left on someone keeps the concentration', () => {
  const app = party();
  const ogre = {
    ...createCreature('ogre', 'Ogre', { maxHP: 9 }),
    conditions: [guidance('cleric')],
  };
  app.state.creatures = [ogre];
  endIfSpent(app, 'cleric', 'guidance');
  assert.equal(app.state.characters[0].concentration, concentrating);
});

test('a caster on another spell, or no caster, writes nothing', () => {
  const app = party({ concentration: { ...concentrating, spellId: 'bless' } });
  const before = app.state.characters;
  endIfSpent(app, 'cleric', 'guidance');
  endIfSpent(app, 'nobody', 'guidance');
  assert.equal(app.state.characters, before);
});

test('a creature caster drops its concentration too', () => {
  const app = party();
  const hag = { ...createCreature('hag', 'Hag', { maxHP: 9 }), concentration: concentrating };
  app.state.creatures = [hag];
  endIfSpent(app, 'hag', 'guidance');
  assert.equal(app.state.creatures[0].concentration, null);
});

test('endSpentCasts skips kept chips and chips with no cast', () => {
  const app = party();
  const kept = guidance('cleric');
  const plain = { name: 'Blessed' };
  endSpentCasts(app, [kept, plain], [kept]);
  assert.equal(app.state.characters[0].concentration, concentrating);
});
