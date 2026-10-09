import { test } from 'node:test';
import assert from 'node:assert/strict';
import { endCasterEffects, endSpellEffects } from '../src/app/combatantWrites.js';
import { spellsHeldBy } from '../src/entities/ImposedConditions.js';
import { createCharacter } from '../src/entities/Character.js';
import { createCreature } from '../src/entities/Creature.js';
import { addCondition } from '../src/entities/Conditions.js';
import { stubApp } from './helpers/app.js';

const hold = { spellId: 'hold', spellName: 'Hold Person', slotLevel: 2, remaining: 10 };

/** A druid holding Hold Person, with a Bless chip and a summoned wolf of its own. */
function scene() {
  const druid = { ...createCharacter('druid', 'Druid'), concentration: hold };
  const goblin = {
    ...createCreature('g1', 'Goblin'),
    conditions: addCondition([], 'Paralyzed', null, {
      source: { casterId: 'druid', spellId: 'hold' },
    }),
  };
  const ally = {
    ...createCharacter('a1', 'Ally'),
    conditions: addCondition([], 'Blessed', null, {
      source: { casterId: 'druid', spellId: 'bless' },
    }),
  };
  const wolf = {
    ...createCreature('w1', 'Wolf'),
    summonedBy: { casterId: 'druid', spellId: 'conjure', spellName: 'Conjure Animals' },
  };
  return { druid, goblin, ally, wolf };
}

test('spellsHeldBy lists the held spell, every sourced chip, and every summon once', () => {
  const { druid, goblin, ally, wolf } = scene();
  const other = {
    ...createCreature('g2', 'Goblin'),
    conditions: addCondition([], 'Paralyzed', null, {
      source: { casterId: 'druid', spellId: 'hold' },
    }),
  };
  assert.deepEqual(spellsHeldBy(druid, [ally, goblin, other, wolf]), ['hold', 'bless', 'conjure']);
  assert.deepEqual(spellsHeldBy(createCharacter('x', 'X'), [ally, goblin, wolf]), []);
});

test('endCasterEffects frees every target and removes every summon of a deleted caster', () => {
  const { druid, goblin, ally, wolf } = scene();
  // The delete path removes the caster before the sweep.
  const app = stubApp({ state: { characters: [ally], creatures: [goblin, wolf] } });
  endCasterEffects(app, druid);
  assert.deepEqual(app.state.characters[0].conditions, []);
  assert.deepEqual(
    app.state.creatures.map((c) => [c.id, c.conditions]),
    [['g1', []]],
  );
  assert.ok(app.log.includes('Goblin is no longer Paralyzed.'));
  assert.ok(app.log.includes('Ally is no longer affected by Blessed.'));
  assert.ok(app.log.includes('Wolf vanishes as Conjure Animals ends.'));
  assert.ok(app.calls.includes('removeCombatant'));
});

test('a new creature that takes a deleted caster id inherits nothing', () => {
  const { druid, goblin, ally, wolf } = scene();
  const app = stubApp({ state: { characters: [ally], creatures: [goblin, wolf] } });
  endCasterEffects(app, druid);
  assert.deepEqual(spellsHeldBy(createCreature('druid', 'Druid'), app.state.creatures), []);
});

test('the end of one Bless leaves the Bless of another caster in place', () => {
  const rider = { rolls: ['attack'], dice: 1, die: 'd4' };
  let conditions = addCondition([], 'Blessed', 10, {
    rider,
    source: { casterId: 'a', spellId: 'bless' },
  });
  conditions = addCondition(conditions, 'Blessed', 10, {
    rider,
    source: { casterId: 'b', spellId: 'bless' },
  });
  const hero = { ...createCharacter('h', 'Hero'), conditions };
  const app = stubApp({ state: { characters: [hero] } });
  endSpellEffects(app, 'b', 'bless');
  assert.deepEqual(
    app.state.characters[0].conditions.map((c) => c.source?.casterId),
    ['a'],
  );
});
