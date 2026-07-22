import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createCharacter,
  addXP,
  setStat,
  addResource,
  spendResource,
  restoreResource,
  addItem,
  removeItem,
} from '../src/entities/Character.js';
import { createResource } from '../src/entities/Resource.js';

test('createCharacter starts at level 1 with no xp/resources/inventory', () => {
  const hero = createCharacter('c1', 'Hero', { STR: 14 });
  assert.equal(hero.level, 1);
  assert.equal(hero.xp, 0);
  assert.deepEqual(hero.resources, []);
  assert.deepEqual(hero.inventory, []);
  assert.equal(hero.stats.STR, 14);
});

test('addXP accumulates without leveling up below the threshold', () => {
  const hero = addXP(createCharacter('c1', 'Hero'), 50);
  assert.equal(hero.level, 1);
  assert.equal(hero.xp, 50);
});

test('addXP levels up once crossing the threshold, carrying remainder xp', () => {
  const hero = addXP(createCharacter('c1', 'Hero'), 120);
  assert.equal(hero.level, 2);
  assert.equal(hero.xp, 20);
});

test('addXP can trigger multiple level-ups in one call', () => {
  // level 1 -> 2 costs 100, level 2 -> 3 costs 200: 320 xp clears both with 20 left over
  const hero = addXP(createCharacter('c1', 'Hero'), 320);
  assert.equal(hero.level, 3);
  assert.equal(hero.xp, 20);
});

test('setStat updates one stat without touching others', () => {
  const hero = setStat(createCharacter('c1', 'Hero', { STR: 14, DEX: 12 }), 'STR', 16);
  assert.equal(hero.stats.STR, 16);
  assert.equal(hero.stats.DEX, 12);
});

test('addResource, spendResource, and restoreResource operate on the matching pool by id', () => {
  let hero = createCharacter('c1', 'Hero');
  hero = addResource(hero, createResource('mana', 'Mana', 'mana', 10));
  hero = spendResource(hero, 'mana', 4);
  assert.equal(hero.resources[0].current, 6);
  hero = restoreResource(hero, 'mana', 100);
  assert.equal(hero.resources[0].current, 10);
});

test('addItem creates a new stack for an unseen item id', () => {
  const hero = addItem(createCharacter('c1', 'Hero'), { id: 'rope', name: 'Rope', quantity: 1, notes: '' });
  assert.equal(hero.inventory.length, 1);
  assert.equal(hero.inventory[0].quantity, 1);
});

test('addItem merges quantity into an existing stack', () => {
  let hero = createCharacter('c1', 'Hero');
  hero = addItem(hero, { id: 'arrow', name: 'Arrow', quantity: 5, notes: '' });
  hero = addItem(hero, { id: 'arrow', name: 'Arrow', quantity: 3, notes: '' });
  assert.equal(hero.inventory.length, 1);
  assert.equal(hero.inventory[0].quantity, 8);
});

test('removeItem reduces quantity and drops the stack once it hits 0', () => {
  let hero = createCharacter('c1', 'Hero');
  hero = addItem(hero, { id: 'arrow', name: 'Arrow', quantity: 5, notes: '' });
  hero = removeItem(hero, 'arrow', 2);
  assert.equal(hero.inventory[0].quantity, 3);
  hero = removeItem(hero, 'arrow', 3);
  assert.equal(hero.inventory.length, 0);
});
