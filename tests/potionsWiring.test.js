import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drinkPotion } from '../src/app/potionsWiring.js';
import { createCharacter, damageCharacter, getHP, withHP } from '../src/entities/Character.js';
import { canSpend, spend } from '../src/combat/ActionBudget.js';
import { stubApp } from './helpers/app.js';

const POTION = /** @type {any} */ ({
  id: 'p',
  name: 'Potion of Healing',
  type: 'consumable',
  quantity: 2,
  heals: { count: 2, sides: 4, bonus: 2 },
});

/** Two hurt characters, the first holding two potions. */
function party(/** @type {any} */ extra = {}) {
  const wren = /** @type {any} */ ({
    ...damageCharacter(withHP(createCharacter('wren', 'Wren'), 20), 15),
    inventory: [POTION],
  });
  const mirelle = damageCharacter(withHP(createCharacter('mirelle', 'Mirelle'), 20), 20);
  const app = stubApp({ state: /** @type {any} */ ({ characters: [wren, mirelle], ...extra }) });
  app.actions.rollDice = () => /** @type {any} */ ({ result: { total: 7 }, text: '' });
  /** @type {string[]} */
  const toasts = [];
  app.toasts = /** @type {any} */ ({ show: (/** @type {string} */ m) => toasts.push(m) });
  /** @param {any} next */
  const store = (next) => {
    app.state.characters = app.state.characters.map((c) => (c.id === next.id ? next : c));
  };
  return { app, wren, store, toasts };
}

const hpOf = (/** @type {any} */ app, /** @type {string} */ id) =>
  getHP(app.state.characters.find((/** @type {any} */ c) => c.id === id))?.current;
const stack = (/** @type {any} */ app) =>
  app.state.characters[0].inventory.find((/** @type {any} */ i) => i.id === 'p')?.quantity;

/** @param {string} recipient */
const pick = (recipient) => /** @type {any} */ (async () => ({ recipient }));

test('a character drinks a potion, heals the roll, and loses one from the stack', async () => {
  const { app, wren, store } = party();
  /** @type {any[]} */
  const asked = [];
  const prompt = /** @type {any} */ (
    async (/** @type {string} */ title, /** @type {any[]} */ fields) => {
      asked.push({ title, fields });
      return { recipient: 'wren' };
    }
  );
  assert.equal(await drinkPotion(app, wren, POTION, store, { prompt }), true);
  assert.equal(asked[0].title, 'Use one Potion of Healing');
  assert.deepEqual(
    asked[0].fields[0].options.map((/** @type {any} */ o) => o.value),
    ['wren', 'mirelle'],
  );
  assert.equal(hpOf(app, 'wren'), 12);
  assert.equal(stack(app), 1);
  assert.ok(app.log.includes('Wren drinks a Potion of Healing: +7 HP (now 12/20).'));
});

test('a potion result shows as a toast with the new HP', async () => {
  const { app, wren, store, toasts } = party();
  assert.equal(await drinkPotion(app, wren, POTION, store, { prompt: pick('wren') }), true);
  assert.deepEqual(toasts, ['Wren drinks a Potion of Healing: +7 HP (now 12/20).']);
});

test('a potion line leaves out the HP readout for a character with no HP pool', async () => {
  const { app, wren, store, toasts } = party();
  app.state.characters[1] = { ...app.state.characters[1], resources: [] };
  assert.equal(await drinkPotion(app, wren, POTION, store, { prompt: pick('mirelle') }), true);
  assert.deepEqual(toasts, ['Wren gives a Potion of Healing to Mirelle: +7 HP.']);
});

test('a potion given to a downed ally heals the ally', async () => {
  const { app, wren, store } = party();
  assert.equal(await drinkPotion(app, wren, POTION, store, { prompt: pick('mirelle') }), true);
  assert.equal(hpOf(app, 'mirelle'), 7);
  assert.equal(hpOf(app, 'wren'), 5);
  assert.ok(app.log.includes('Wren gives a Potion of Healing to Mirelle: +7 HP (now 7/20).'));
});

test('a dead recipient keeps the potion on the stack', async () => {
  const { app, wren, store, toasts } = party();
  app.state.characters[1] = {
    ...app.state.characters[1],
    deathSaves: { successes: 0, failures: 3, stable: false },
  };
  assert.equal(await drinkPotion(app, wren, POTION, store, { prompt: pick('mirelle') }), false);
  assert.equal(stack(app), 2);
  assert.deepEqual(toasts, ['Mirelle is dead. A potion does not help.']);
});

test('a cancelled dialog or an unknown pick uses nothing', async () => {
  const { app, wren, store } = party();
  const cancel = /** @type {any} */ (async () => null);
  assert.equal(await drinkPotion(app, wren, POTION, store, { prompt: cancel }), false);
  assert.equal(await drinkPotion(app, wren, POTION, store, { prompt: pick('ghost') }), false);
  assert.equal(stack(app), 2);
});

test('an item with no heal dice is left to the inventory panel', async () => {
  const { app, wren, store } = party();
  const { heals: _heals, ...flask } = POTION;
  assert.equal(await drinkPotion(app, wren, flask, store), false);
});

test('a lone character drinks with no dialog', async () => {
  const { app, wren, store } = party();
  app.state.characters = [wren];
  const prompt = /** @type {any} */ (async () => assert.fail('no dialog'));
  assert.equal(await drinkPotion(app, wren, POTION, store, { prompt }), true);
  assert.equal(hpOf(app, 'wren'), 12);
});

test('on the drinker turn the potion costs the action', async () => {
  const combat = {
    order: ['wren', 'mirelle'].map((id) => ({ id, initiative: 10, modifier: 0 })),
    index: 0,
    round: 1,
  };
  const { app, wren, store, toasts } = party({ combat });
  app.actions.spendBudget = (/** @type {string} */ id, /** @type {any} */ cost) => {
    const i = app.state.combat.order.findIndex((/** @type {any} */ p) => p.id === id);
    if (!canSpend(app.state.combat.order[i], cost)) return false;
    const order = [...app.state.combat.order];
    order[i] = spend(order[i], cost);
    app.state.combat = { ...app.state.combat, order };
    return true;
  };
  assert.equal(await drinkPotion(app, wren, POTION, store, { prompt: pick('wren') }), true);
  const again = app.state.characters[0];
  assert.equal(await drinkPotion(app, again, POTION, store, { prompt: pick('wren') }), false);
  assert.equal(toasts.at(-1), 'Wren has no action left this turn.');
  assert.equal(stack(app), 1);
});

test('a custom consumable with heal dice drinks under any name', async () => {
  const draught = { ...POTION, name: 'Troll Draught', heals: { count: 3, sides: 6, bonus: 0 } };
  const { app, wren, store } = party();
  app.state.characters[0] = { ...wren, inventory: [draught] };
  /** @type {any[]} */
  const rolled = [];
  app.actions.rollDice = (/** @type {any} */ selection) => {
    rolled.push(selection);
    return /** @type {any} */ ({ result: { total: 9 }, text: '' });
  };
  assert.equal(await drinkPotion(app, wren, draught, store, { prompt: pick('wren') }), true);
  assert.deepEqual(rolled, [{ counts: { d6: 3 }, modifier: 0 }]);
  assert.ok(app.log.includes('Wren drinks a Troll Draught: +9 HP (now 14/20).'));
});

test('a change to the drinker while the dialog is open stays after the drink', async () => {
  const { app, wren, store } = party();
  const prompt = /** @type {any} */ (
    async () => {
      // A player patch lands while the dialog is open.
      app.state.characters = app.state.characters.map((/** @type {any} */ c) =>
        c.id === 'wren' ? { ...c, notes: 'patched' } : c,
      );
      return { recipient: 'mirelle' };
    }
  );
  assert.equal(await drinkPotion(app, wren, POTION, store, { prompt }), true);
  assert.equal(app.state.characters[0].notes, 'patched');
  assert.equal(stack(app), 1);
});

test('a potion that leaves while the dialog is open is not used', async () => {
  const { app, wren, store } = party();
  const prompt = /** @type {any} */ (
    async () => {
      app.state.characters = app.state.characters.map((/** @type {any} */ c) =>
        c.id === 'wren' ? { ...c, inventory: [] } : c,
      );
      return { recipient: 'mirelle' };
    }
  );
  assert.equal(await drinkPotion(app, wren, POTION, store, { prompt }), false);
  assert.equal(hpOf(app, 'mirelle'), 0);
});
