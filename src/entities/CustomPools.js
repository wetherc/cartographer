import { HP_RESOURCE_ID } from './PoolIds.js';
import { isSlotPool, isPactPool } from './SpellSlots.js';
import { isHitDicePool } from './HitDice.js';
import { isClassPool } from './ClassPools.js';
import { createResource, setMax } from './Resource.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/entities.js').ResourcePool} ResourcePool */
/** @typedef {import('../types/entities.js').PoolRecharge} PoolRecharge */
/** @typedef {{ name: string, max: number, recharge: PoolRecharge }} PoolSpec */

/**
 * This module keeps the GM's own resource pools: a pool that the class list
 * does not derive, such as the charges of a wand or a homebrew feature. The
 * GM sets its name, its size, and the rest that refills it. Every function
 * here is pure.
 */

/** The id prefix of a pool that the GM adds. */
export const CUSTOM_POOL_PREFIX = 'pool-';

/**
 * @param {ResourcePool} pool
 * @returns {boolean} true for a pool that no rule derives, so the GM can edit it
 */
export function isCustomPool(pool) {
  return (
    pool.id !== HP_RESOURCE_ID &&
    !isSlotPool(pool) &&
    !isPactPool(pool) &&
    !isHitDicePool(pool) &&
    !isClassPool(pool)
  );
}

/**
 * The name trimmed, and the size as a whole number of at least 1. A blank
 * name falls back to "Pool".
 * @param {PoolSpec} spec
 * @returns {PoolSpec}
 */
function cleanSpec(spec) {
  const max = Math.max(1, Math.floor(Number(spec.max) || 0));
  return { name: spec.name.trim() || 'Pool', max, recharge: spec.recharge };
}

/**
 * Add a full pool under the first free id `pool-1`, `pool-2`, and so on.
 * @param {Character} character
 * @param {PoolSpec} spec
 * @returns {Character}
 */
export function addCustomPool(character, spec) {
  const { name, max, recharge } = cleanSpec(spec);
  const taken = new Set(character.resources.map((r) => r.id));
  let n = 1;
  while (taken.has(`${CUSTOM_POOL_PREFIX}${n}`)) n += 1;
  const pool = { ...createResource(`${CUSTOM_POOL_PREFIX}${n}`, name, 'custom', max), recharge };
  return { ...character, resources: [...character.resources, pool] };
}

/**
 * Rename, resize, or set the recharge of one of the GM's pools. A smaller
 * size lowers the current value to fit. A derived pool, or an id that no
 * pool has, returns the character unchanged.
 * @param {Character} character
 * @param {string} id
 * @param {PoolSpec} spec
 * @returns {Character}
 */
export function editCustomPool(character, id, spec) {
  const target = character.resources.find((r) => r.id === id);
  if (!target || !isCustomPool(target)) return character;
  const { name, max, recharge } = cleanSpec(spec);
  const next = { ...setMax(target, max), name, recharge };
  return { ...character, resources: character.resources.map((r) => (r === target ? next : r)) };
}

/**
 * Remove one of the GM's pools. A derived pool stays.
 * @param {Character} character
 * @param {string} id
 * @returns {Character}
 */
export function removeCustomPool(character, id) {
  const target = character.resources.find((r) => r.id === id);
  if (!target || !isCustomPool(target)) return character;
  return { ...character, resources: character.resources.filter((r) => r !== target) };
}

/**
 * The rest that refills the pool, as the sheet words it.
 * @param {ResourcePool} pool
 * @returns {string}
 */
export function rechargeLabel(pool) {
  if (pool.recharge === 'none') return 'no rest';
  const base = pool.recharge === 'short' ? 'short rest' : 'long rest';
  return pool.shortRestRegain ? `${base}, ${pool.shortRestRegain} on a short rest` : base;
}
