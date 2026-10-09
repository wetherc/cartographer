import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COINS,
  addCoins,
  addGold,
  coercePurse,
  emptyPurse,
  formatPurse,
  migrateGoldStack,
  purseOf,
  setPurse,
} from '../src/entities/Purse.js';
import { createCharacter, withDefaults } from '../src/entities/Character.js';

const stack = (/** @type {string} */ id, /** @type {string} */ name, quantity = 5) => ({
  id,
  name,
  quantity,
  notes: '',
  type: /** @type {const} */ ('gear'),
});

test('coercePurse reads whole counts of the five coins', () => {
  assert.deepEqual(coercePurse(null), emptyPurse());
  assert.deepEqual(coercePurse({ gp: 2.7, sp: -3, cp: 'x', pp: '4', junk: 9 }), {
    pp: 4,
    gp: 2,
    ep: 0,
    sp: 0,
    cp: 0,
  });
  assert.deepEqual(
    COINS.map((c) => c.key),
    ['pp', 'gp', 'ep', 'sp', 'cp'],
  );
});

test('a load moves the gold stack of an older save into the purse', () => {
  const old = /** @type {any} */ ({
    inventory: [stack('rope', 'Rope'), stack('gold', 'Coins', 10), stack('p2', 'gold (GP)', 3)],
    purse: { sp: 4 },
  });
  const moved = migrateGoldStack(old);
  assert.deepEqual(moved.purse, { ...emptyPurse(), gp: 13, sp: 4 });
  assert.deepEqual(
    moved.inventory.map((i) => i.id),
    ['rope'],
  );
  const bar = /** @type {any} */ ({ inventory: [stack('bar', 'Gold bar')] });
  const kept = migrateGoldStack(bar);
  assert.equal(kept.inventory, bar.inventory, 'a gold bar is not coins');
  assert.deepEqual(kept.purse, emptyPurse());
  const hero = withDefaults(
    /** @type {any} */ ({
      ...createCharacter('h', 'Hero'),
      inventory: [stack('gold', 'Gold (gp)', 25)],
    }),
  );
  assert.equal(purseOf(hero).gp, 25);
  assert.equal(hero.inventory.length, 0);
  assert.deepEqual(withDefaults(hero).purse, hero.purse, 'a second load changes nothing');
});

test('addCoins and addGold add whole coins and skip nothing-to-add', () => {
  const hero = createCharacter('h', 'Hero');
  assert.deepEqual(purseOf(hero), emptyPurse());
  const paid = addGold(hero, 2.7);
  assert.equal(purseOf(paid).gp, 2);
  assert.equal(addGold(hero, 0), hero);
  assert.equal(addGold(hero, Number.NaN), hero);
  const mixed = addCoins(paid, { sp: 5, cp: 3, gp: -1 });
  assert.deepEqual(purseOf(mixed), { ...emptyPurse(), gp: 2, sp: 5, cp: 3 });
  assert.equal(addCoins(hero, {}), hero);
});

test('setPurse replaces the coins and keeps the character when nothing changes', () => {
  const hero = addGold(createCharacter('h', 'Hero'), 5);
  assert.equal(setPurse(hero, { gp: 5 }), hero);
  assert.deepEqual(purseOf(setPurse(hero, { gp: 1, pp: 2 })), { ...emptyPurse(), gp: 1, pp: 2 });
});

test('formatPurse names the coins from the most valuable', () => {
  assert.equal(formatPurse(emptyPurse()), 'No coins');
  assert.equal(formatPurse({ ...emptyPurse(), sp: 5, gp: 12, pp: 1 }), '1 pp, 12 gp, 5 sp');
});
