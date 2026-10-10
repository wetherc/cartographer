import { test } from 'node:test';
import assert from 'node:assert/strict';
import { endIfSpent, endSpentCasts } from '../src/app/spentCasts.js';
import { spendRollRiders } from '../src/app/riderSpend.js';
import { applyToTarget, retryImposedSaves } from '../src/app/combatantWrites.js';
import { createCharacter, withHP } from '../src/entities/Character.js';
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

const resistanceSource = { casterId: 'cleric', spellId: 'resistance', spellName: 'Resistance' };
const resistance = {
  name: 'Resistance',
  rider: { rolls: ['save'], dice: 1, die: 'd4', once: true },
  source: resistanceSource,
};
const onResistance = { ...concentrating, spellId: 'resistance', spellName: 'Resistance' };
const onBless = { ...concentrating, spellId: 'bless', spellName: 'Bless' };

/** A cleric concentrating on Resistance, beside the given combatants. */
function warded(/** @type {{ characters?: any[], creatures?: any[] }} */ lists) {
  const cleric = {
    ...createCharacter('cleric', 'Cleric'),
    concentration: onResistance,
    conditions: [{ name: 'Concentrating' }],
  };
  return stubApp({
    state: /** @type {any} */ ({
      characters: [cleric, ...(lists.characters ?? [])],
      creatures: lists.creatures ?? [],
    }),
  });
}

test('a creature concentration save that spends Resistance ends the caster concentration', () => {
  const hag = {
    ...createCreature('hag', 'Hag', { maxHP: 30 }),
    concentration: onBless,
    conditions: [{ name: 'Concentrating' }, resistance],
  };
  const app = warded({ creatures: [hag] });
  applyToTarget(app, 'hag', 4, false);
  assert.equal(app.state.characters[0].concentration, null);
  assert.ok(!app.state.creatures[0].conditions.some((c) => c.name === 'Resistance'));
  assert.match(app.log.join('\n'), /Cleric stops concentrating on Resistance\./);
});

test('a character concentration save that spends Resistance ends the caster concentration', () => {
  const wizard = {
    ...withHP(createCharacter('wizard', 'Wizard'), 20),
    concentration: onBless,
    conditions: [{ name: 'Concentrating' }, resistance],
  };
  const app = warded({ characters: [wizard] });
  applyToTarget(app, 'wizard', 4, false);
  assert.equal(app.state.characters[0].concentration, null);
  assert.match(app.log.join('\n'), /Cleric stops concentrating on Resistance\./);
});

test('a repeated save that spends Resistance ends the caster concentration', () => {
  // DC 99 always fails, so the Paralyzed chip stays and only the rider goes.
  const held = {
    name: 'Paralyzed',
    source: {
      casterId: 'hag',
      spellId: 'hold-person',
      spellName: 'Hold Person',
      saveEnds: true,
      saveDC: 99,
      saveAbility: 'WIS',
    },
  };
  const fighter = { ...createCharacter('fighter', 'Fighter'), conditions: [held, resistance] };
  const app = warded({ characters: [fighter] });
  retryImposedSaves(app, 'fighter');
  assert.equal(app.state.characters[0].concentration, null);
  assert.deepEqual(
    app.state.characters[1].conditions.map((c) => c.name),
    ['Paralyzed'],
  );
});

test('a cast chip that damage ends leaves the caster concentrating', () => {
  const asleep = { name: 'Asleep', source: { ...resistanceSource, endsOnDamage: true } };
  const wizard = { ...withHP(createCharacter('wizard', 'Wizard'), 20), conditions: [asleep] };
  const app = warded({ characters: [wizard] });
  applyToTarget(app, 'wizard', 4, false);
  assert.equal(app.state.characters[1].conditions.length, 0);
  assert.equal(app.state.characters[0].concentration, onResistance);
});
