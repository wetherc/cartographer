import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addCustomPool,
  editCustomPool,
  removeCustomPool,
  isCustomPool,
  rechargeLabel,
} from '../src/entities/CustomPools.js';
import {
  createCharacter,
  withHP,
  spendResource,
  shortRest,
  longRest,
} from '../src/entities/Character.js';
import { classPoolsFor } from '../src/entities/ClassPools.js';
import { createResource } from '../src/entities/Resource.js';

/** @typedef {import('../src/types/entities.js').Character} Character */

const hero = () => withHP(createCharacter('h', 'Hero'), 20);
/** @param {Character} c @param {string} id */
const pool = (c, id) => c.resources.find((r) => r.id === id);

test('addCustomPool adds a full pool under the first free id', () => {
  const one = addCustomPool(hero(), { name: ' Wand ', max: 3, recharge: 'none' });
  assert.deepEqual(pool(one, 'pool-1'), {
    id: 'pool-1',
    name: 'Wand',
    current: 3,
    max: 3,
    recharge: 'none',
  });
  const two = addCustomPool(one, { name: '', max: 0, recharge: 'short' });
  assert.equal(pool(two, 'pool-2')?.name, 'Pool', 'a blank name falls back');
  assert.equal(pool(two, 'pool-2')?.max, 1, 'the size is at least 1');
});

test('editCustomPool renames, resizes, and sets the recharge', () => {
  let c = addCustomPool(hero(), { name: 'Wand', max: 5, recharge: 'long' });
  c = spendResource(c, 'pool-1', 1);
  const edited = editCustomPool(c, 'pool-1', { name: 'Staff', max: 2.7, recharge: 'short' });
  assert.deepEqual(
    [pool(edited, 'pool-1')?.name, pool(edited, 'pool-1')?.max, pool(edited, 'pool-1')?.current],
    ['Staff', 2, 2],
  );
  assert.equal(pool(edited, 'pool-1')?.recharge, 'short');
  assert.equal(editCustomPool(c, 'hp', { name: 'x', max: 1, recharge: 'none' }), c);
  assert.equal(editCustomPool(c, 'missing', { name: 'x', max: 1, recharge: 'none' }), c);
});

test('removeCustomPool drops a custom pool and leaves a derived one', () => {
  const c = addCustomPool(hero(), { name: 'Wand', max: 3, recharge: 'long' });
  assert.equal(pool(removeCustomPool(c, 'pool-1'), 'pool-1'), undefined);
  assert.equal(removeCustomPool(c, 'hp'), c);
  assert.equal(removeCustomPool(c, 'missing'), c);
});

test('isCustomPool is false for every derived pool', () => {
  assert.equal(isCustomPool(createResource('pool-1', 'Wand', 1)), true);
  for (const id of ['hp', 'slots-1', 'pact-1', 'hit-dice-d8', 'ki']) {
    assert.equal(isCustomPool(createResource(id, id, 1)), false, id);
  }
});

test('a pool with no recharge refills on no rest', () => {
  let c = addCustomPool(hero(), { name: 'Wand', max: 3, recharge: 'none' });
  c = spendResource(c, 'pool-1', 3);
  assert.equal(pool(shortRest(c), 'pool-1')?.current, 0);
  assert.equal(pool(longRest(c), 'pool-1')?.current, 0);
});

test('Sorcerous Restoration regains 4 sorcery points on a short rest at sorcerer 20', () => {
  /** @param {number} level */
  const sorcerer = (level) => ({
    ...hero(),
    classes: [{ classId: 'sorcerer', level }],
    level,
  });
  const at19 = classPoolsFor(sorcerer(19)).find((p) => p.id === 'sorcery-points');
  assert.equal(at19?.shortRestRegain, undefined);
  const points = classPoolsFor(sorcerer(20)).find((p) => p.id === 'sorcery-points');
  assert.equal(points?.shortRestRegain, 4);
  const c = spendResource(
    { ...hero(), resources: [points ?? createResource('x', 'x', 1)] },
    'sorcery-points',
    20,
  );
  assert.equal(pool(shortRest(c), 'sorcery-points')?.current, 4);
  assert.equal(pool(longRest(c), 'sorcery-points')?.current, 20);
});

test('rechargeLabel words each recharge', () => {
  const base = createResource('pool-1', 'Wand', 1);
  assert.equal(rechargeLabel(base), 'long rest');
  assert.equal(rechargeLabel({ ...base, recharge: 'short' }), 'short rest');
  assert.equal(rechargeLabel({ ...base, recharge: 'none' }), 'no rest');
  assert.equal(
    rechargeLabel({ ...base, recharge: 'long', shortRestRegain: 4 }),
    'long rest, 4 on a short rest',
  );
});

test('a long-rest pool keeps a short-rest regain, capped at its size', () => {
  const one = addCustomPool(hero(), {
    name: 'Ki',
    max: 4,
    recharge: 'long',
    shortRestRegain: 9,
  });
  assert.equal(pool(one, 'pool-1')?.shortRestRegain, 4);
  const lower = editCustomPool(one, 'pool-1', {
    name: 'Ki',
    max: 4,
    recharge: 'long',
    shortRestRegain: 2.7,
  });
  assert.equal(pool(lower, 'pool-1')?.shortRestRegain, 2);
  const cleared = editCustomPool(lower, 'pool-1', {
    name: 'Ki',
    max: 4,
    recharge: 'long',
    shortRestRegain: 0,
  });
  assert.equal('shortRestRegain' in (pool(cleared, 'pool-1') ?? {}), false);
});

test('a short-rest or no-rest pool drops the short-rest regain', () => {
  for (const recharge of /** @type {const} */ (['short', 'none'])) {
    const one = addCustomPool(hero(), { name: 'Wand', max: 3, recharge, shortRestRegain: 2 });
    assert.equal('shortRestRegain' in (pool(one, 'pool-1') ?? {}), false);
  }
  const bare = addCustomPool(hero(), { name: 'Wand', max: 3, recharge: 'long' });
  assert.equal('shortRestRegain' in (pool(bare, 'pool-1') ?? {}), false);
});
