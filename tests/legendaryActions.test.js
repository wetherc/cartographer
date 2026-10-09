import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  budgetOf,
  freshBudget,
  isFresh,
  legendaryLeft,
  refresh,
  spendLegendary,
} from '../src/combat/ActionBudget.js';
import { advanceTurn } from '../src/combat/Initiative.js';
import { SWINGS, canSwing, legendarySwing, swingKind } from '../src/combat/AttackTweaks.js';
import { buildCombatView } from '../src/combat/CombatView.js';
import { rollWeaponAttack } from '../src/app/weaponAttack.js';
import { attackDialog } from '../src/app/attackFields.js';
import { createCreature } from '../src/entities/Creature.js';
import { createCharacter, withHP } from '../src/entities/Character.js';
import { roll } from '../src/dice/DiceRoller.js';
import { stubApp } from './helpers/app.js';

const HERE = { nodeId: 'n1', tileId: '0,0' };

/** @param {Partial<import('../src/types/combat.js').ActionBudget>} [used] @returns {any} */
const at = (used) => ({
  id: 'king',
  initiative: 10,
  modifier: 0,
  used: { ...freshBudget(), ...used },
});

const king = createCreature('king', 'King', {
  disposition: 'hostile',
  maxHP: 60,
  stats: { AC: 10, STR: 16 },
  location: HERE,
  level: 5,
  legendaryActions: 3,
  weapons: [{ name: 'Greatsword', damage: [{ count: 2, sides: 6, damageType: 'slashing' }] }],
});

test('legendaryLeft counts down from the creature count and never below zero', () => {
  assert.equal(legendaryLeft(at(), 3), 3);
  assert.equal(legendaryLeft(at({ legendary: 2 }), 3), 1);
  assert.equal(legendaryLeft(at({ legendary: 5 }), 3), 0);
  assert.equal(legendaryLeft(at(), undefined), 0, 'a creature with none has none left');
});

test('spendLegendary spends one at a time and stops at the last one', () => {
  const once = spendLegendary(at(), 2);
  assert.equal(budgetOf(once.used).legendary, 1);
  const twice = spendLegendary(once, 2);
  assert.equal(legendaryLeft(twice, 2), 0);
  assert.equal(spendLegendary(twice, 2), twice, 'no legendary action left returns it unchanged');
});

test('budgetOf reads a broken legendary count as none spent', () => {
  assert.equal(budgetOf({ legendary: -1 }).legendary, 0);
  assert.equal(budgetOf({ legendary: 'two' }).legendary, 0);
  assert.equal(budgetOf({ legendary: 1.8 }).legendary, 1);
});

test('refresh gives the legendary actions back, and a spent one makes the budget not fresh', () => {
  const spent = at({ legendary: 2 });
  assert.equal(isFresh(spent), false);
  assert.equal(budgetOf(refresh(spent).used).legendary, 0);
});

test('the legendary actions refill when the turn of the creature starts, and not before', () => {
  const state = {
    order: [
      { id: 'hero', initiative: 15, modifier: 0 },
      { id: 'king', initiative: 10, modifier: 0, used: { ...freshBudget(), legendary: 2 } },
    ],
    index: 0,
    round: 1,
    startedAt: 0,
  };
  const kingTurn = advanceTurn(state).state;
  assert.equal(budgetOf(kingTurn.order[1].used).legendary, 0);
  const spent = { ...kingTurn, order: [kingTurn.order[0], spendLegendary(kingTurn.order[1], 3)] };
  const heroTurn = advanceTurn(spent).state;
  assert.equal(
    budgetOf(heroTurn.order[1].used).legendary,
    1,
    'the turn of another combatant keeps the count',
  );
});

test('swingKind and canSwing know the legendary swing', () => {
  assert.equal(swingKind({ legendary: true, reaction: true }), 'legendary');
  assert.equal(canSwing(at({ action: true, reaction: true }), 'legendary', 1), true);
});

test('legendarySwing numbers the use in the log note', () => {
  assert.equal(legendarySwing(king, at()).note, ', legendary action 1 of 3');
  assert.equal(legendarySwing(king, at({ legendary: 2 })).note, ', legendary action 3 of 3');
  assert.equal(legendarySwing({}, null).note, ', legendary action 1 of 1');
  assert.equal(legendarySwing(king, at()).cost, SWINGS.legendary.cost);
});

/**
 * A stub app with a hero and the king, whose budget action records each spend.
 * @param {boolean} allow what the budget answers
 */
function legendaryApp(allow) {
  const hero = withHP(createCharacter('hero', 'Hero', {}), 30);
  const app = stubApp({
    state: /** @type {any} */ ({
      characters: [hero],
      creatures: [king],
      combat: {
        order: [
          { id: 'hero', initiative: 15, modifier: 0 },
          { id: 'king', initiative: 10, modifier: 0, used: { ...freshBudget(), legendary: 1 } },
        ],
        index: 0,
        round: 1,
        startedAt: 0,
      },
    }),
    partyTracker: /** @type {any} */ ({ getPosition: () => HERE }),
    actions: {
      rollDice: (/** @type {any} */ selection) => ({ result: roll(selection, () => 0.95) }),
    },
  });
  /** @type {string[]} */
  const toasts = [];
  app.toasts = { show: (/** @type {string} */ m) => toasts.push(m) };
  /** @type {any[]} */
  const spends = [];
  app.actions.spendBudget = (
    /** @type {any} */ id,
    /** @type {any} */ cost,
    /** @type {any} */ o,
  ) => {
    spends.push({ id, cost, ...o });
    return allow;
  };
  return { app, spends, toasts };
}

test('a legendary swing spends one legendary action and logs its number', () => {
  const { app, spends } = legendaryApp(true);
  rollWeaponAttack(app, {
    attacker: king,
    defender: { id: 'hero', name: 'Hero', ac: 10 },
    weapon: /** @type {any} */ (king.weapons[0]),
    tweaks: { legendary: true },
    rng: () => 0.5,
  });
  assert.deepEqual(spends, [{ id: 'king', cost: 'legendary', legendaryActions: 3 }]);
  assert.ok(app.log.some((/** @type {string} */ l) => l.includes('legendary action 2 of 3')));
});

test('a legendary swing with none left rolls nothing and says so', () => {
  const { app, toasts } = legendaryApp(false);
  rollWeaponAttack(app, {
    attacker: king,
    defender: { id: 'hero', name: 'Hero', ac: 10 },
    weapon: /** @type {any} */ (king.weapons[0]),
    tweaks: { legendary: true },
  });
  assert.deepEqual(app.log, []);
  assert.match(toasts[0], /has no legendary action left this round/);
});

test('the legendary dialog has its own title and offers no Multiattack volley', () => {
  const dialog = attackDialog({
    attacker: { ...king, multiattack: 2 },
    defenders: [{ id: 'hero', name: 'Hero', ac: 10 }],
    participant: at(),
    weapon: /** @type {any} */ (king.weapons[0]),
    defenderId: 'hero',
    offhand: false,
    reaction: false,
    legendary: true,
  });
  assert.equal(dialog.title, 'Legendary action: attack with Greatsword');
  assert.equal(
    dialog.fields.some((f) => f.name === 'multiattack' || f.name === 'free-action'),
    false,
  );
});

test('a combat row counts the legendary actions a creature has left', () => {
  const combat = {
    order: [
      { id: 'king', initiative: 10, modifier: 0, used: { ...freshBudget(), legendary: 1 } },
      { id: 'hero', initiative: 5, modifier: 0 },
    ],
    index: 1,
    round: 1,
    startedAt: 0,
  };
  const hero = withHP(createCharacter('hero', 'Hero', {}), 30);
  /** @type {Record<string, any>} */
  const found = {
    king: { kind: 'creature', entity: king },
    hero: { kind: 'character', entity: hero },
  };
  const view = buildCombatView(/** @type {any} */ (combat), (id) => found[id] ?? null, {
    gm: true,
  });
  assert.equal(view.rows[0].legendaryLeft, 2);
  assert.equal(view.rows[1].legendaryLeft, 0);
});
