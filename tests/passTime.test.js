import { test } from 'node:test';
import assert from 'node:assert/strict';

import { passTime, passTravelTime } from '../src/app/passTime.js';
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
  assert.deepEqual(app.calls, [], 'no time passes, so nothing runs');
  passTime(app, 2);
  assert.equal(app.state.characters, characters);
  assert.equal(app.state.creatures, creatures);
  assert.deepEqual(app.calls, ['syncExits'], 'only the exit arrows follow the new sight');
});

test('a creature timed chip that runs out refreshes the creature panels', () => {
  const ogre = { ...createCreature('o', 'Ogre'), conditions: [createCondition('Slowed', 10)] };
  const app = stubApp({ state: { creatures: [ogre] } });
  passTime(app, 1);
  assert.deepEqual(app.state.creatures[0].conditions, []);
  assert.ok(app.refreshes.includes('encounterPanel'));
});

test('a walk that crosses a watch logs and announces its length and the new time', () => {
  /** @type {string[]} */
  const toasts = [];
  const app = stubApp({ toasts: { show: (/** @type {string} */ m) => toasts.push(m) } });
  assert.equal(passTravelTime(app, 90), true);
  assert.deepEqual(app.state.clock, { day: 1, watch: 0, minutes: 90 });
  assert.deepEqual([...app.log, ...toasts], [], 'inside one watch: no message');
  passTravelTime(app, 240);
  const text = 'The walk took 4 hours. Now Day 1, Morning.';
  assert.deepEqual(app.log, [text]);
  assert.deepEqual(toasts, [text]);
  assert.equal(passTravelTime(app, 0), false, 'a free walk changes nothing');
  assert.deepEqual(app.state.clock, { day: 1, watch: 1, minutes: 90 });
});

test('passing a watch ends a creature concentration, its chips, and its summons', () => {
  const source = { casterId: 'hag', spellId: 'hold' };
  const hag = {
    ...createCreature('hag', 'Hag'),
    concentration: { spellId: 'hold', spellName: 'Hold Person', slotLevel: 2, remaining: 10 },
    conditions: [createCondition('Concentrating', 10)],
  };
  const wolf = {
    ...createCreature('w1', 'Wolf'),
    summonedBy: { casterId: 'hag', spellId: 'hold', spellName: 'Hold Person' },
  };
  const cleric = {
    ...createCharacter('c1', 'Cleric'),
    conditions: [createCondition('Paralyzed', null, { source })],
  };
  const app = stubApp({ state: { characters: [cleric], creatures: [hag, wolf] } });
  passTime(app, 1);
  assert.deepEqual(
    app.state.creatures.map((c) => [c.id, c.concentration ?? null]),
    [['hag', null]],
  );
  assert.deepEqual(app.state.characters[0].conditions, []);
  assert.ok(app.log.includes("Hag's concentration on Hold Person ends."));
  assert.ok(app.log.includes('Cleric is no longer Paralyzed.'));
});
