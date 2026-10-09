import { test } from 'node:test';
import assert from 'node:assert/strict';
import { takeTurnAction, toggleBudget, turnActionsOf } from '../src/app/turnActions.js';
import { budgetOf, canSpend, spend, surge, unspend } from '../src/combat/ActionBudget.js';
import { turnActions } from '../src/combat/TurnActions.js';
import { createCreature } from '../src/entities/Creature.js';
import { stubApp } from './helpers/app.js';

/** @param {string} id @param {string} classId @param {number} level @returns {any} */
const hero = (id, classId, level) => ({
  id,
  name: id[0].toUpperCase() + id.slice(1),
  classes: [{ classId, level }],
  level,
  conditions: [],
  resources: [],
});

/** A stub app in a fight between a rogue, a fighter, and a goblin. */
function fight() {
  const goblin = { ...createCreature('Goblin', 7), id: 'gob' };
  const app = stubApp({
    state: /** @type {any} */ ({
      characters: [hero('wren', 'rogue', 4), hero('aldric', 'fighter', 4)],
      creatures: [goblin],
      combat: {
        order: ['wren', 'aldric', 'gob'].map((id) => ({ id, initiative: 10, modifier: 0 })),
        index: 0,
        round: 1,
        startedAt: 0,
      },
    }),
  });
  // The same budget write that encounterWiring registers.
  app.actions.spendBudget = (/** @type {string} */ id, /** @type {any} */ cost) => {
    const combat = app.state.combat;
    const i = combat.order.findIndex((/** @type {any} */ p) => p.id === id);
    if (!canSpend(combat.order[i], cost)) return false;
    const order = [...combat.order];
    order[i] = spend(order[i], cost);
    app.state.combat = { ...combat, order };
    return true;
  };
  app.actions.toggleBudget = (/** @type {string} */ id, /** @type {any} */ cost) => {
    const combat = app.state.combat;
    const i = combat ? combat.order.findIndex((/** @type {any} */ p) => p.id === id) : -1;
    if (i < 0) return null;
    const free = canSpend(combat.order[i], cost);
    const order = [...combat.order];
    order[i] = free ? spend(order[i], cost) : unspend(order[i], cost);
    app.state.combat = { ...combat, order };
    app.actions.markDirty();
    app.views.combatScreen.update();
    return free;
  };
  return app;
}

/** @param {any} app @param {string} id */
const usedOf = (app, id) =>
  budgetOf(app.state.combat.order.find((/** @type {any} */ p) => p.id === id).used);

test('a rogue of level 2 gets the Cunning Action entries, a fighter and a foe do not', () => {
  const app = fight();
  assert.ok(turnActionsOf(app, 'wren').some((a) => a.cost === 'bonus'));
  assert.ok(turnActionsOf(app, 'aldric').every((a) => a.cost === 'action'));
  assert.equal(turnActionsOf(app, 'gob').length, 6);
  assert.deepEqual(turnActionsOf(app, 'nobody'), []);
});

test('a standard action spends the action and logs a line', () => {
  const app = fight();
  const [dash] = turnActions();
  assert.equal(takeTurnAction(app, 'aldric', dash), true);
  assert.equal(usedOf(app, 'aldric').action, true);
  assert.deepEqual(app.log, ['Aldric takes the Dash action.']);
});

test('an action the turn already spent refuses with a toast and logs nothing', () => {
  /** @type {string[]} */
  const toasts = [];
  const app = fight();
  app.toasts = /** @type {any} */ ({ show: (/** @type {string} */ m) => toasts.push(m) });
  const [dash, disengage] = turnActions();
  takeTurnAction(app, 'aldric', dash);
  assert.equal(takeTurnAction(app, 'aldric', disengage), false);
  assert.deepEqual(toasts, ['Aldric has no action left this turn.']);
  assert.equal(app.log.length, 1);
  assert.equal(takeTurnAction(app, 'nobody', dash), false);
});

test('a Cunning Action hide spends the bonus action and leaves the action free', () => {
  const app = fight();
  const hide = turnActionsOf(app, 'wren').find((a) => a.id === 'hide' && a.cost === 'bonus');
  takeTurnAction(app, 'wren', /** @type {any} */ (hide));
  assert.deepEqual(usedOf(app, 'wren'), { ...usedOf(app, 'aldric'), bonus: true });
  assert.match(app.log[0], /as a bonus action \(Cunning Action\)/);
});

test('Dodge leaves a Dodging chip that ends at the start of the next turn', () => {
  const app = fight();
  const dodge = turnActions().find((a) => a.id === 'dodge');
  takeTurnAction(app, 'gob', /** @type {any} */ (dodge));
  const chip = app.state.creatures[0].conditions.find((c) => c.name === 'Dodging');
  assert.deepEqual(chip?.expires, { who: 'gob', at: 'start', count: 1 });
});

test('pressing a budget chip marks the cost used, and pressing it again frees it', () => {
  const app = fight();
  toggleBudget(app, 'aldric', 'bonus');
  assert.equal(usedOf(app, 'aldric').bonus, true);
  toggleBudget(app, 'aldric', 'bonus');
  assert.equal(usedOf(app, 'aldric').bonus, false);
  assert.deepEqual(app.log, [
    "Aldric's bonus action is marked used.",
    "Aldric's bonus action is marked free.",
  ]);
  assert.ok(app.refreshes.includes('combatScreen'));
  assert.equal(app.dirty, 2);
});

test('a budget chip outside a fight or for a stranger changes nothing', () => {
  const app = fight();
  toggleBudget(app, 'nobody', 'action');
  app.state.combat = null;
  toggleBudget(app, 'aldric', 'action');
  assert.equal(app.dirty, 0);
  assert.deepEqual(app.log, []);
});

/**
 * A fight whose fighter holds HP and both fighter pools, with the surge write
 * of encounterWiring.
 * @param {number} [uses] uses left in each pool
 */
function fighterFight(uses = 1) {
  const app = fight();
  const pool = (/** @type {string} */ id) => ({
    id,
    name: id,
    type: 'uses',
    current: uses,
    max: 1,
  });
  app.state.characters[1] = {
    ...app.state.characters[1],
    resources: [
      { id: 'hp', name: 'HP', type: 'hp', current: 10, max: 40 },
      pool('second-wind'),
      pool('action-surge'),
    ],
  };
  /** @type {string[]} */
  const toasts = [];
  app.toasts = /** @type {any} */ ({ show: (/** @type {string} */ m) => toasts.push(m) });
  app.actions.surgeBudget = (/** @type {string} */ id) => {
    const combat = app.state.combat;
    const i = combat.order.findIndex((/** @type {any} */ p) => p.id === id);
    const next = surge(combat.order[i]);
    if (next === combat.order[i]) return false;
    const order = [...combat.order];
    order[i] = next;
    app.state.combat = { ...combat, order };
    return true;
  };
  return { app, toasts };
}

/** @param {any} app @param {string} id */
const poolOf = (app, id) =>
  app.state.characters[1].resources.find((/** @type {any} */ r) => r.id === id).current;

/** @param {any} app @param {string} id */
const entry = (app, id) =>
  /** @type {any} */ (turnActionsOf(app, 'aldric').find((a) => a.id === id));

test('Second Wind spends the bonus action and a use, and heals 1d10 + fighter level', () => {
  const { app } = fighterFight();
  assert.equal(takeTurnAction(app, 'aldric', entry(app, 'second-wind'), { rng: () => 0.45 }), true);
  assert.equal(usedOf(app, 'aldric').bonus, true);
  assert.equal(poolOf(app, 'second-wind'), 0);
  assert.equal(poolOf(app, 'hp'), 19, '10 HP plus d10 5 plus level 4');
  assert.equal(app.log[0], 'Aldric uses Second Wind and regains 9 HP (d10 5 + 4).');
});

test('Second Wind with no use left, or no bonus action, refuses and keeps the use', () => {
  const empty = fighterFight(0);
  assert.equal(takeTurnAction(empty.app, 'aldric', entry(empty.app, 'second-wind')), false);
  assert.match(empty.toasts[0], /no use of Second Wind left/);
  const busy = fighterFight();
  busy.app.actions.spendBudget('aldric', 'bonus');
  assert.equal(takeTurnAction(busy.app, 'aldric', entry(busy.app, 'second-wind')), false);
  assert.equal(poolOf(busy.app, 'second-wind'), 1);
  assert.deepEqual(busy.toasts, ['Aldric has no bonus action left this turn.']);
});

test('Action Surge gives a spent action back, and spends a use', () => {
  const { app } = fighterFight();
  app.actions.spendBudget('aldric', 'action');
  assert.equal(takeTurnAction(app, 'aldric', entry(app, 'action-surge')), true);
  assert.equal(usedOf(app, 'aldric').action, false);
  assert.equal(poolOf(app, 'action-surge'), 0);
  assert.deepEqual(app.log, ['Aldric uses Action Surge and takes one more action this turn.']);
});

test('Action Surge before the action gives two actions, once per turn', () => {
  const { app, toasts } = fighterFight(2);
  const surgeEntry = entry(app, 'action-surge');
  assert.equal(takeTurnAction(app, 'aldric', surgeEntry), true);
  assert.equal(takeTurnAction(app, 'aldric', surgeEntry), false, 'one surge per turn');
  assert.deepEqual(toasts, ['Aldric already used Action Surge this turn.']);
  assert.equal(poolOf(app, 'action-surge'), 1);
  assert.equal(app.actions.spendBudget('aldric', 'action'), true);
  assert.equal(app.actions.spendBudget('aldric', 'action'), true);
  assert.equal(app.actions.spendBudget('aldric', 'action'), false, 'two actions in all');
});

test('pressing the Action pip while a surge spare waits logs the spare as used', () => {
  const { app } = fighterFight();
  assert.equal(takeTurnAction(app, 'aldric', entry(app, 'action-surge')), true);
  toggleBudget(app, 'aldric', 'action');
  assert.equal(usedOf(app, 'aldric').spare, false);
  assert.equal(usedOf(app, 'aldric').action, false);
  assert.equal(app.log.at(-1), "Aldric's Action Surge action is marked used.");
});

test('a creature cannot use a class action', () => {
  const { app } = fighterFight();
  assert.equal(takeTurnAction(app, 'gob', entry(app, 'action-surge')), false);
});

test('a cleric of level 2 gets the Channel Divinity buttons with its pool', () => {
  const app = fight();
  app.state.characters = [
    {
      ...hero('mirelle', 'cleric', 4),
      classes: [{ classId: 'cleric', level: 4, subclass: 'Life Domain' }],
      resources: [{ id: 'channel-divinity', name: 'Channel Divinity', current: 1, max: 1 }],
    },
  ];
  const ids = turnActionsOf(app, 'mirelle').map((a) => a.id);
  assert.ok(ids.includes('turn-undead') && ids.includes('preserve-life'));
});

test('Rage spends the bonus action and a use, and leaves a Raging chip with the Rage mods', () => {
  const app = fight();
  app.state.characters[1] = {
    ...app.state.characters[1],
    classes: [{ classId: 'barbarian', level: 9 }],
    resources: [{ id: 'rage', name: 'Rage', type: 'uses', current: 1, max: 4 }],
  };
  const rage = /** @type {any} */ (turnActionsOf(app, 'aldric').find((a) => a.id === 'rage'));
  assert.equal(takeTurnAction(app, 'aldric', rage), true);
  const aldric = app.state.characters[1];
  assert.equal(usedOf(app, 'aldric').bonus, true);
  assert.equal(aldric.resources[0].current, 0);
  const chip = aldric.conditions.find((/** @type {any} */ c) => c.name === 'Raging');
  assert.equal(chip.rounds, 10);
  assert.equal(chip.mods.meleeDamage, 3);
  assert.match(app.log.join('\n'), /Aldric enters a Rage: \+3 melee damage/);
});
