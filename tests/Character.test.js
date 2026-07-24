import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createCharacter,
  withDefaults,
  withHP,
  getHP,
  HP_RESOURCE_ID,
  ABILITY_SCORES,
  addXP,
  setStat,
  addResource,
  spendResource,
  restoreResource,
  addItem,
  removeItem,
  setMaxHP,
  setBonusHP,
  damageCharacter,
} from '../src/entities/Character.js';
import { getSlotPools } from '../src/entities/SpellSlots.js';
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

test('withDefaults migrates a mana-era save to spell slots for its level', () => {
  let mage = withHP(createCharacter('c1', 'Mage'), 10);
  mage = addResource(mage, createResource('mana', 'Mana', 'mana', 8));
  mage = { ...mage, level: 3 };
  const migrated = withDefaults(mage);
  assert.equal(migrated.resources.some((r) => r.id === 'mana'), false);
  assert.deepEqual(
    getSlotPools(migrated).map((p) => ({ id: p.id, max: p.max, current: p.current })),
    [
      { id: 'slots-1', max: 4, current: 4 },
      { id: 'slots-2', max: 2, current: 2 },
    ],
  );
});

test('withDefaults leaves a mana-less character without slot pools', () => {
  const fighter = withDefaults(withHP(createCharacter('c1', 'Fighter'), 10));
  assert.deepEqual(getSlotPools(fighter), []);
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

test('addXP grows the HP pool per level gained, default a tenth of max', () => {
  let hero = withHP(createCharacter('c1', 'Hero'), 20);
  hero = addXP(hero, 320); // level 1 -> 3, two levels gained
  // HP grows ceil(20*0.1)=2 per level -> +4.
  assert.equal(getHP(hero).max, 24);
  assert.equal(getHP(hero).current, 24);
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

test('setMaxHP overrides the pool maximum, clamping current down when needed', () => {
  const hero = withHP(createCharacter('c1', 'Hero'), 20);
  const raised = setMaxHP(hero, 30);
  assert.equal(getHP(raised)?.max, 30);
  assert.equal(getHP(raised)?.current, 20, 'raising the max does not heal');
  const lowered = setMaxHP(hero, 12);
  assert.equal(getHP(lowered)?.max, 12);
  assert.equal(getHP(lowered)?.current, 12, 'current clamps to the new max');
  assert.equal(getHP(setMaxHP(hero, 0))?.max, 1, 'max never drops below 1');
  const poolless = createCharacter('c2', 'Ghost');
  assert.deepEqual(setMaxHP(poolless, 10).resources, [], 'no pool is invented');
});

test('setBonusHP tracks temporary points, never negative', () => {
  const hero = withHP(createCharacter('c1', 'Hero'), 20);
  assert.equal(setBonusHP(hero, 5).bonusHP, 5);
  assert.equal(setBonusHP(hero, -3).bonusHP, 0);
});

test('damageCharacter drains bonus HP before the pool', () => {
  let hero = setBonusHP(withHP(createCharacter('c1', 'Hero'), 20), 3);
  hero = damageCharacter(hero, 2);
  assert.equal(hero.bonusHP, 1);
  assert.equal(getHP(hero)?.current, 20, 'bonus absorbed the whole hit');
  hero = damageCharacter(hero, 5);
  assert.equal(hero.bonusHP, 0);
  assert.equal(getHP(hero)?.current, 16, 'remainder spills into the pool');
  hero = damageCharacter(hero, 100);
  assert.equal(getHP(hero)?.current, 0, 'pool clamps at zero');
});

test('withDefaults backfills bonusHP as 0', () => {
  const legacy = { ...createCharacter('c1', 'Hero') };
  delete legacy.bonusHP;
  assert.equal(withDefaults(legacy).bonusHP, 0);
});
