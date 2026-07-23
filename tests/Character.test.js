import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createCharacter,
  withDefaults,
  withHP,
  getHP,
  withMana,
  getMana,
  HP_RESOURCE_ID,
  MANA_RESOURCE_ID,
  ABILITY_SCORES,
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

test('createCharacter fills all six ability scores at 10, keeping overrides', () => {
  const hero = createCharacter('c1', 'Hero', { STR: 14 });
  assert.deepEqual(Object.keys(hero.stats), ABILITY_SCORES);
  assert.equal(hero.stats.STR, 14);
  assert.equal(hero.stats.WIS, 10);
});

test('withDefaults backfills missing scores and race on a loaded character', () => {
  const legacy = { ...createCharacter('c1', 'Hero'), stats: { STR: 16, DEX: 8 } };
  delete legacy.race;
  const filled = withDefaults(legacy);
  assert.deepEqual(
    filled.stats,
    { STR: 16, DEX: 8, CON: 10, INT: 10, WIS: 10, CHA: 10 },
  );
  assert.equal(filled.race, '');
  assert.deepEqual(legacy.stats, { STR: 16, DEX: 8 }, 'input untouched');
});

test('withDefaults keeps an existing race and does not invent an HP pool', () => {
  const elf = withDefaults(createCharacter('c1', 'Hero', {}, 'Elf'));
  assert.equal(elf.race, 'Elf');
  assert.equal(getHP(elf), null);
});

test('withHP gives a full-health pool under the reserved id, replacing any existing one', () => {
  let hero = withHP(createCharacter('c1', 'Hero'), 12);
  const hp = getHP(hero);
  assert.equal(hp?.id, HP_RESOURCE_ID);
  assert.deepEqual({ current: hp?.current, max: hp?.max }, { current: 12, max: 12 });

  hero = withHP(hero, 20);
  assert.equal(hero.resources.filter((r) => r.id === HP_RESOURCE_ID).length, 1);
  assert.equal(getHP(hero)?.max, 20);
});

test('HP damage/heal works through the generic resource spend/restore machinery', () => {
  let hero = withHP(createCharacter('c1', 'Hero'), 10);
  hero = spendResource(hero, HP_RESOURCE_ID, 4);
  assert.equal(getHP(hero)?.current, 6);
  hero = restoreResource(hero, HP_RESOURCE_ID, 100);
  assert.equal(getHP(hero)?.current, 10);
});

test('withMana gives a full pool of type mana under the reserved id, replacing any existing one', () => {
  let mage = withMana(createCharacter('c1', 'Mage'), 8);
  const mana = getMana(mage);
  assert.equal(mana?.id, MANA_RESOURCE_ID);
  assert.equal(mana?.type, 'mana');
  assert.deepEqual({ current: mana?.current, max: mana?.max }, { current: 8, max: 8 });

  mage = withMana(mage, 12);
  assert.equal(mage.resources.filter((r) => r.id === MANA_RESOURCE_ID).length, 1);
  assert.equal(getMana(mage)?.max, 12);
});

test('withMana orders HP before mana and leaves other resources intact', () => {
  let mage = withHP(createCharacter('c1', 'Mage'), 10);
  mage = addResource(mage, createResource('ki', 'Ki', 'custom', 3));
  mage = withMana(mage, 8);
  assert.deepEqual(
    mage.resources.map((r) => r.id),
    [HP_RESOURCE_ID, MANA_RESOURCE_ID, 'ki'],
  );
});

test('getMana returns null when no mana pool exists', () => {
  assert.equal(getMana(createCharacter('c1', 'Fighter')), null);
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

test('addXP grows the HP and mana pools per level gained, default a tenth of max', () => {
  let hero = withMana(withHP(createCharacter('c1', 'Hero'), 20), 10);
  hero = addXP(hero, 320); // level 1 -> 3, two levels gained
  // HP grows ceil(20*0.1)=2 per level -> +4; mana ceil(10*0.1)=1 -> +2.
  assert.equal(getHP(hero).max, 24);
  assert.equal(getHP(hero).current, 24);
  assert.equal(hero.resources.find((r) => r.id === 'mana').max, 12);
});

test('addXP honors an explicit per-level growth override', () => {
  let hero = withHP(createCharacter('c1', 'Hero'), 20);
  hero = addXP(hero, 100, { hpGrowth: 5 }); // one level -> +5
  assert.equal(getHP(hero).max, 25);
});

test('addXP leaves a pool-less character unchanged but for level/xp', () => {
  const hero = addXP(createCharacter('c1', 'Hero'), 120);
  assert.equal(hero.level, 2);
  assert.deepEqual(hero.resources, []);
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
