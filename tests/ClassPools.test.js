import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classPoolsFor, isClassPool, syncClassPools } from '../src/entities/ClassPools.js';
import { derive, withClasses } from '../src/entities/Progression.js';
import {
  createCharacter,
  withHP,
  addResource,
  spendResource,
  shortRest,
  longRest,
  withDefaults,
} from '../src/entities/Character.js';
import { createResource } from '../src/entities/Resource.js';
import { CLASS_POOL_IDS } from '../src/entities/PoolIds.js';

/** @typedef {import('../src/types/entities.js').Character} Character */
/** @typedef {import('../src/types/class.js').ClassRef} ClassRef */

/** @param {ClassRef[]} classes @param {Record<string, number>} [stats] @returns {Character} */
function classed(classes, stats = {}) {
  const level = classes.reduce((sum, ref) => sum + ref.level, 0);
  return { ...createCharacter('c1', 'Hero', stats), classes, level };
}

/** @param {string} classId @param {number} level @param {Record<string, number>} [stats] */
function uses(classId, level, stats) {
  return Object.fromEntries(
    classPoolsFor(classed([{ classId, level }], stats)).map((p) => [p.id, [p.max, p.recharge]]),
  );
}

test('a fighter gets Second Wind at 1, Action Surge at 2, and a second surge at 17', () => {
  assert.deepEqual(uses('fighter', 1), { 'second-wind': [1, 'short'] });
  assert.deepEqual(uses('fighter', 2)['action-surge'], [1, 'short']);
  assert.deepEqual(uses('fighter', 16)['action-surge'], [1, 'short']);
  assert.deepEqual(uses('fighter', 17)['action-surge'], [2, 'short']);
});

test('a fighter gets Indomitable at 9, with a second use at 13 and a third at 17', () => {
  assert.equal(uses('fighter', 8).indomitable, undefined);
  assert.deepEqual(uses('fighter', 9).indomitable, [1, 'long']);
  assert.deepEqual(uses('fighter', 12).indomitable, [1, 'long']);
  assert.deepEqual(uses('fighter', 13).indomitable, [2, 'long']);
  assert.deepEqual(uses('fighter', 17).indomitable, [3, 'long']);
});

test('a barbarian rages by the SRD table and has no pool at level 20', () => {
  const rage = (/** @type {number} */ level) => uses('barbarian', level).rage?.[0] ?? 0;
  assert.deepEqual(
    [1, 2, 3, 5, 6, 11, 12, 16, 17, 19, 20].map(rage),
    [2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 0],
  );
  assert.equal(uses('barbarian', 1).rage[1], 'long');
});

test('Bardic Inspiration counts the CHA modifier, at least 1, and recharges on a short rest from 5', () => {
  assert.deepEqual(uses('bard', 1, { CHA: 16 })['bardic-inspiration'], [3, 'long']);
  assert.deepEqual(uses('bard', 1, { CHA: 8 })['bardic-inspiration'], [1, 'long']);
  assert.deepEqual(uses('bard', 5, { CHA: 16 })['bardic-inspiration'], [3, 'short']);
});

test('a cleric channels divinity once at 2, twice at 6, three times at 18', () => {
  const cd = (/** @type {number} */ level) => uses('cleric', level)['channel-divinity']?.[0] ?? 0;
  assert.deepEqual([1, 2, 5, 6, 17, 18].map(cd), [0, 1, 1, 2, 2, 3]);
});

test('a paladin gets Divine Sense, Lay on Hands, and Channel Divinity at 3', () => {
  assert.deepEqual(uses('paladin', 1, { CHA: 14 }), {
    'divine-sense': [3, 'long'],
    'lay-on-hands': [5, 'long'],
  });
  assert.deepEqual(uses('paladin', 3, { CHA: 14 }), {
    'channel-divinity': [1, 'short'],
    'divine-sense': [3, 'long'],
    'lay-on-hands': [15, 'long'],
  });
  assert.equal(uses('paladin', 1, { CHA: 8 })['divine-sense'], undefined, '1 + (-1) is no use');
});

test('a second class that grants Channel Divinity adds no use', () => {
  const pools = classPoolsFor(
    classed([
      { classId: 'cleric', level: 6 },
      { classId: 'paladin', level: 3 },
    ]),
  );
  assert.equal(pools.find((p) => p.id === 'channel-divinity')?.max, 2);
});

test('monk, druid, sorcerer, and wizard pools follow the class level', () => {
  assert.deepEqual(uses('monk', 1), {});
  assert.deepEqual(uses('monk', 5), { ki: [5, 'short'] });
  assert.deepEqual(uses('druid', 2), { 'wild-shape': [2, 'short'] });
  assert.deepEqual(uses('druid', 20), {});
  assert.deepEqual(uses('sorcerer', 1), {});
  assert.deepEqual(uses('sorcerer', 7), { 'sorcery-points': [7, 'long'] });
  assert.deepEqual(uses('wizard', 1), { 'arcane-recovery': [1, 'long'] });
  assert.deepEqual(uses('rogue', 5), {}, 'a class with no tracked feature gets no pool');
});

test('the pools come out in the order of CLASS_POOL_IDS', () => {
  const ids = classPoolsFor(
    classed([
      { classId: 'wizard', level: 1 },
      { classId: 'fighter', level: 2 },
      { classId: 'barbarian', level: 1 },
    ]),
  ).map((p) => p.id);
  assert.deepEqual(
    ids,
    CLASS_POOL_IDS.filter((id) => ids.includes(id)),
  );
  assert.deepEqual(ids, ['second-wind', 'action-surge', 'rage', 'arcane-recovery']);
});

test('isClassPool picks out the reserved class ids only', () => {
  assert.equal(isClassPool(createResource('ki', 'Ki', 2)), true);
  assert.equal(isClassPool(createResource('torch', 'Torch', 2)), false);
});

test('syncClassPools places the pools after HP and hit dice, ahead of custom pools', () => {
  let hero = withHP(classed([{ classId: 'fighter', level: 2 }]), 20);
  hero = addResource(hero, createResource('torch', 'Torch', 3));
  const ids = syncClassPools(hero).resources.map((r) => r.id);
  assert.deepEqual(ids, ['hp', 'second-wind', 'action-surge', 'torch']);
});

test('syncClassPools returns the same character when the pools already match', () => {
  const hero = syncClassPools(classed([{ classId: 'fighter', level: 2 }]));
  assert.equal(syncClassPools(hero), hero);
  const plain = createCharacter('c2', 'Nobody');
  assert.equal(syncClassPools(plain), plain);
});

test('a level gained adds uses unspent, and a lost class drops its pool', () => {
  let hero = derive(classed([{ classId: 'barbarian', level: 2 }]));
  hero = spendResource(hero, 'rage', 1);
  const grown = withClasses({ ...hero, level: 3 }, [{ classId: 'barbarian', level: 3 }]);
  const rage = grown.resources.find((r) => r.id === 'rage');
  assert.deepEqual([rage?.current, rage?.max], [2, 3]);
  const dropped = withClasses(grown, [{ classId: 'fighter', level: 3 }]);
  assert.equal(
    dropped.resources.some((r) => r.id === 'rage'),
    false,
  );
});

test('a new recharge rule replaces the stored one at bard level 5', () => {
  const bard = derive(classed([{ classId: 'bard', level: 4 }], { CHA: 14 }));
  const five = withClasses({ ...bard, level: 5 }, [{ classId: 'bard', level: 5 }]);
  assert.equal(five.resources.find((r) => r.id === 'bardic-inspiration')?.recharge, 'short');
});

test('a short rest refills short-rest class pools and keeps long-rest ones spent', () => {
  let hero = derive(
    classed([
      { classId: 'fighter', level: 2 },
      { classId: 'barbarian', level: 1 },
    ]),
  );
  hero = spendResource(
    spendResource(spendResource(hero, 'second-wind', 1), 'action-surge', 1),
    'rage',
    2,
  );
  const now = (/** @type {Character} */ c, /** @type {string} */ id) =>
    c.resources.find((r) => r.id === id)?.current;
  const short = shortRest(hero);
  assert.deepEqual(
    ['second-wind', 'action-surge', 'rage'].map((id) => now(short, id)),
    [1, 1, 0],
  );
  const long = longRest(hero);
  assert.equal(now(long, 'rage'), 2);
});

test('a missing CHA score reads as 10', () => {
  const bard = { ...classed([{ classId: 'bard', level: 1 }]), stats: {} };
  assert.equal(classPoolsFor(bard)[0].max, 1);
});

test('a loaded save gains the class pools of its classes', () => {
  const loaded = withDefaults({ ...classed([{ classId: 'monk', level: 3 }]) });
  assert.deepEqual(
    loaded.resources.filter(isClassPool).map((r) => [r.id, r.max, r.recharge]),
    [['ki', 3, 'short']],
  );
});
