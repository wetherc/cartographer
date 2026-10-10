import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advancePastHeld, startLandingTurn } from '../src/app/turnAdvance.js';
import { createParticipant, startCombat } from '../src/combat/Initiative.js';
import { createCharacter, withHP } from '../src/entities/Character.js';
import { createCreature } from '../src/entities/Creature.js';
import { addCondition } from '../src/entities/Conditions.js';
import { stubApp } from './helpers/app.js';

/** A Hold Person chip. DC 1 always saves, and DC 99 never does. */
const held = (/** @type {number} */ saveDC) =>
  addCondition([], 'Paralyzed', 10, {
    source: {
      spellId: 'hold-person',
      spellName: 'Hold Person',
      casterId: 'mage',
      saveAbility: 'WIS',
      saveDC,
      saveEnds: true,
    },
  });

/**
 * A fight in the order mage, ogre, hero, with the mage acting. The ogre is
 * held by a chip with the given DC.
 * @param {number} saveDC
 */
function fight(saveDC) {
  const mage = withHP(createCharacter('mage', 'Mage'), 10);
  const hero = withHP(createCharacter('hero', 'Hero'), 10);
  const ogre = { ...createCreature('ogre', 'Ogre', { maxHP: 30 }), conditions: held(saveDC) };
  const app = stubApp({ state: { characters: [mage, hero], creatures: [ogre] } });
  app.state.combat = startCombat(
    [createParticipant('mage', 20), createParticipant('ogre', 15), createParticipant('hero', 10)],
    (id) => id,
  );
  return { app };
}

/** The hooks the encounter wiring passes: store the order, and count wraps. */
function advance(/** @type {any} */ app) {
  return advancePastHeld(app, {
    setCombat: (next) => {
      app.state.combat = next;
    },
    tickRound: () => app.calls.push('tickRound'),
  });
}

test('a held combatant the pointer steps past rolls its repeated save', () => {
  const { app } = fight(1);
  const result = advance(app);
  assert.equal(result?.state.order[result.state.index].id, 'hero', 'the held turn is still lost');
  assert.deepEqual(app.state.creatures[0].conditions, [], 'the save ends the chip');
  assert.match(app.log.join('\n'), /Ogre shakes off Paralyzed/);
});

test('a held combatant that fails the save stays held', () => {
  const { app } = fight(99);
  advance(app);
  assert.equal(app.state.creatures[0].conditions.length, 1);
  assert.match(app.log.join('\n'), /Ogre is still Paralyzed/);
});

test('a downed combatant rolls no repeated save as the pointer passes it', () => {
  const { app } = fight(1);
  app.state.creatures = [{ ...app.state.creatures[0], currentHP: 0 }];
  advance(app);
  assert.equal(app.state.creatures[0].conditions.length, 1);
  assert.equal(app.log.length, 0);
});

test('the turn now ending rolls its repeated save first', () => {
  const { app } = fight(99);
  app.state.characters = [
    { ...app.state.characters[0], conditions: held(1) },
    app.state.characters[1],
  ];
  advance(app);
  assert.deepEqual(app.state.characters[0].conditions, []);
  assert.match(app.log[0], /^Mage shakes off Paralyzed/);
});

test('a skipped turn and the landing turn both start, so their boundary chips end', () => {
  const { app } = fight(99);
  const until = (/** @type {string} */ who) =>
    addCondition([], 'Shield', null, { expires: { who, at: 'start', count: 1 } });
  app.state.characters = [
    { ...app.state.characters[0], conditions: until('ogre') },
    { ...app.state.characters[1], conditions: until('hero') },
  ];
  advance(app);
  assert.deepEqual(app.state.characters[0].conditions, [], "the ogre's skipped turn started");
  assert.deepEqual(app.state.characters[1].conditions, [], "the hero's turn started");
});

test('the pointer moves from the order as the end-of-turn work leaves it', () => {
  const { app } = fight(99);
  // A chip on the mage whose end-of-turn damage stands in for any work that
  // rewrites the order. Here the work drops the hero from the fight.
  app.actions.logEvent = () => {
    const combat = app.state.combat;
    if (combat && combat.order.some((p) => p.id === 'hero')) {
      app.state.combat = { ...combat, order: combat.order.filter((p) => p.id !== 'hero') };
    }
  };
  app.state.characters = [
    {
      ...app.state.characters[0],
      conditions: addCondition([], 'Burning', null, {
        ongoing: { damage: [{ count: 1, sides: 4, damageType: 'fire' }] },
      }),
    },
    app.state.characters[1],
  ];
  advance(app);
  assert.deepEqual(
    app.state.combat.order.map((p) => p.id),
    ['mage', 'ogre'],
    'the stored order keeps the removal',
  );
});

test('with no fight running, nothing advances', () => {
  const { app } = fight(99);
  app.state.combat = null;
  assert.equal(advance(app), null);
});

test('a wrap runs the skipped turns before the wrap, then ticks, then the ones after', () => {
  const { app } = fight(1);
  const [mage, hero] = app.state.characters;
  app.state.characters = [
    { ...mage, conditions: held(1) },
    { ...hero, conditions: held(1) },
  ];
  app.state.creatures = [{ ...app.state.creatures[0], conditions: [] }];
  app.state.combat = { ...app.state.combat, index: 1 };
  advancePastHeld(app, {
    setCombat: (next) => {
      app.state.combat = next;
    },
    tickRound: () => app.log.push('tick'),
  });
  assert.deepEqual(
    app.log.map((line) => line.split(' ')[0]),
    ['Hero', 'tick', 'Mage'],
  );
});

test('a dying character keeps its turn, and its start asks for a death save', () => {
  const { app } = fight(99);
  const hero = app.state.characters[1];
  app.state.characters[1] = {
    ...withHP(hero, 10),
    resources: hero.resources.map((/** @type {any} */ r) => ({ ...r, current: 0 })),
    deathSaves: { successes: 0, failures: 0, stable: false },
    conditions: addCondition([], 'Unconscious', null),
  };
  const result = advance(app);
  assert.equal(result?.state.order[result.state.index].id, 'hero');
  assert.match(app.log.join('\n'), /Hero is dying\. Roll a death save\./);
});

test('a landing on a held combatant starts its turn and passes the turn on', () => {
  const { app } = fight(99);
  app.state.combat = { ...app.state.combat, index: 1 };
  startLandingTurn(app, {
    setCombat: (next) => {
      app.state.combat = next;
    },
    tickRound: () => app.calls.push('tickRound'),
  });
  const combat = app.state.combat;
  assert.equal(combat.order[combat.index].id, 'hero');
  assert.match(app.log.join('\n'), /Ogre/);
});

test('a landing on a combatant who can act only starts its turn', () => {
  const { app } = fight(99);
  const before = app.state.combat;
  startLandingTurn(app, { setCombat: () => assert.fail('no move'), tickRound: () => {} });
  assert.equal(app.state.combat.index, before.index);
});

test('a landing with no fight does nothing', () => {
  const app = stubApp({ state: { combat: null } });
  startLandingTurn(app, { setCombat: () => assert.fail('no fight'), tickRound: () => {} });
});
