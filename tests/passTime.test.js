import { test } from 'node:test';
import assert from 'node:assert/strict';

import { passTime } from '../src/app/passTime.js';
import { createCharacter } from '../src/entities/Character.js';
import { createCreature } from '../src/entities/Creature.js';
import { createCondition } from '../src/entities/Conditions.js';
import { stubApp } from './helpers/app.js';

test('passing a watch ends a concentration spell and the chips it holds on others', () => {
  const source = { casterId: 'c1', spellId: 'hold' };
  const cleric = {
    ...createCharacter('c1', 'Cleric'),
    concentration: { spellId: 'hold', spellName: 'Hold Person', slotLevel: 2, remaining: 10 },
    conditions: [createCondition('Concentrating', 10)],
  };
  // An open-ended chip ends only because its spell ends.
  const bandit = {
    ...createCreature('b1', 'Bandit'),
    conditions: [createCondition('Paralyzed', null, { source })],
  };
  const app = stubApp({ state: { characters: [cleric], creatures: [bandit] } });
  passTime(app, 1);
  assert.equal(app.state.characters[0].concentration, null);
  assert.deepEqual(app.state.creatures[0].conditions, []);
  assert.ok(app.log.includes("Cleric's concentration on Hold Person ends."));
  assert.ok(app.log.includes('Bandit is no longer Paralyzed.'));
});

test('no time, or nothing timed, leaves every collection as it was', () => {
  const app = stubApp({
    state: { characters: [createCharacter('c1', 'A')], creatures: [createCreature('x', 'X')] },
  });
  const { characters, creatures } = app.state;
  passTime(app, 0);
  passTime(app, 2);
  assert.equal(app.state.characters, characters);
  assert.equal(app.state.creatures, creatures);
  assert.deepEqual(app.calls, []);
});

test('a creature timed chip that runs out refreshes the creature panels', () => {
  const ogre = { ...createCreature('o', 'Ogre'), conditions: [createCondition('Slowed', 10)] };
  const app = stubApp({ state: { creatures: [ogre] } });
  passTime(app, 1);
  assert.deepEqual(app.state.creatures[0].conditions, []);
  assert.ok(app.refreshes.includes('encounterPanel'));
});
