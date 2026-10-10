import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wireTurnOrder } from '../src/app/turnOrder.js';
import { setCombatantConditions } from '../src/app/combatantWrites.js';
import { createParticipant, startCombat } from '../src/combat/Initiative.js';
import { createCharacter, withHP } from '../src/entities/Character.js';
import { createCreature } from '../src/entities/Creature.js';
import { addCondition } from '../src/entities/Conditions.js';
import { stubApp } from './helpers/app.js';

/** A fight in the order mage, ogre, hero, with the turn edits wired. */
function fight() {
  const mage = withHP(createCharacter('mage', 'Mage'), 10);
  const hero = withHP(createCharacter('hero', 'Hero'), 10);
  const ogre = createCreature('ogre', 'Ogre', { maxHP: 30 });
  const app = stubApp({ state: { characters: [mage, hero], creatures: [ogre] } });
  app.state.combat = startCombat(
    [createParticipant('mage', 20), createParticipant('ogre', 15), createParticipant('hero', 10)],
    (id) => id,
  );
  wireTurnOrder(app, {
    setCombat: (next) => {
      app.state.combat = next;
    },
    tickRound: () => {},
  });
  return app;
}

test('Previous turn moves the pointer back and logs the turn', () => {
  const app = fight();
  app.actions.retreatCombatTurn();
  assert.equal(app.state.combat?.index, 0, 'the first turn has nothing before it');
  assert.equal(app.log.length, 0);
  app.state.combat = { ...app.state.combat, index: 2 };
  app.actions.retreatCombatTurn();
  assert.equal(app.state.combat?.index, 1);
  assert.match(app.log.join('\n'), /goes back to Ogre's turn/);
});

test('a new initiative sorts the order and keeps the turn', () => {
  const app = fight();
  app.actions.setCombatInitiative('hero', 25);
  assert.deepEqual(
    app.state.combat?.order.map((p) => p.id),
    ['hero', 'mage', 'ogre'],
  );
  assert.equal(app.state.combat?.order[app.state.combat.index].id, 'mage');
  assert.match(app.log.join('\n'), /Hero's initiative is now 25/);
  const before = app.state.combat;
  app.actions.setCombatInitiative('hero', Number.NaN);
  app.actions.setCombatInitiative('hero', 25);
  assert.equal(app.state.combat, before, 'no change writes nothing');
});

test('Delay passes the turn to the next row', () => {
  const app = fight();
  app.actions.delayCombatTurn();
  assert.deepEqual(
    app.state.combat?.order.map((p) => p.id),
    ['ogre', 'mage', 'hero'],
  );
  assert.equal(app.state.combat?.index, 0);
  assert.match(app.log.join('\n'), /Mage delays the turn/);
  app.state.combat = { ...app.state.combat, index: 2 };
  const last = app.state.combat;
  app.actions.delayCombatTurn();
  assert.equal(app.state.combat, last, 'the last row has no later turn');
});

test('Delay onto a row that cannot act passes the turn on', () => {
  const app = fight();
  app.state.creatures = [
    { ...app.state.creatures[0], conditions: addCondition([], 'Paralyzed', null) },
  ];
  app.actions.delayCombatTurn();
  const combat = app.state.combat;
  assert.deepEqual(
    combat?.order.map((p) => p.id),
    ['ogre', 'mage', 'hero'],
  );
  assert.equal(combat?.order[combat.index].id, 'mage', 'the held ogre loses its turn');
});

test('the actions do nothing with no fight running', () => {
  const app = fight();
  app.state.combat = null;
  app.actions.retreatCombatTurn();
  app.actions.setCombatInitiative('hero', 3);
  app.actions.delayCombatTurn();
  assert.equal(app.state.combat, null);
});

test('setCombatantConditions stores a hand edit on a creature or a character', () => {
  const app = fight();
  setCombatantConditions(app, 'ogre', addCondition([], 'Prone', null));
  assert.deepEqual(
    app.state.creatures[0].conditions.map((c) => c.name),
    ['Prone'],
  );
  setCombatantConditions(app, 'hero', addCondition([], 'Blinded', 2));
  assert.deepEqual(
    app.state.characters[1].conditions.map((c) => c.name),
    ['Blinded'],
  );
  setCombatantConditions(app, 'nobody', []);
});
