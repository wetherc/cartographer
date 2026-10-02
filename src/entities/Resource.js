/** @typedef {import('../types/entities.js').ResourcePool} ResourcePool */
/** @typedef {import('../types/entities.js').ResourceType} ResourceType */

import { clamp } from '../util/num.js';

/**
 * Create a resource pool (item count, mana, or custom expendable) at full capacity.
 * @param {string} id
 * @param {string} name
 * @param {ResourceType} type
 * @param {number} max
 * @returns {ResourcePool}
 */
export function createResource(id, name, type, max) {
  return { id, name, type, current: max, max };
}

/**
 * Spend from a pool, clamped so current never drops below 0.
 * @param {ResourcePool} pool
 * @param {number} amount
 * @returns {ResourcePool}
 */
export function spend(pool, amount) {
  return { ...pool, current: Math.max(0, pool.current - amount) };
}

/**
 * Restore a pool, clamped so current never exceeds max.
 * @param {ResourcePool} pool
 * @param {number} amount
 * @returns {ResourcePool}
 */
export function restore(pool, amount) {
  return { ...pool, current: Math.min(pool.max, pool.current + amount) };
}

/**
 * Change a pool's max capacity, clamping current down if it now exceeds it.
 * @param {ResourcePool} pool
 * @param {number} max
 * @returns {ResourcePool}
 */
export function setMax(pool, max) {
  return { ...pool, max, current: Math.min(pool.current, max) };
}

/**
 * Move a pool's max and carry current by the same delta. A raise grants the
 * points instead of only lifting the ceiling, and a drop takes the points
 * back. Current stays within the range 0 to max. This is the re-derive rule:
 * the app recomputes the pool's max from class, level, and stats, and the
 * character must end up where that computation places them.
 * @param {ResourcePool} pool
 * @param {number} max
 * @returns {ResourcePool}
 */
export function adjustMax(pool, max) {
  const current = pool.current + (max - pool.max);
  return { ...pool, max, current: clamp(current, 0, max) };
}

/**
 * Move a pool's max, and carry current up by what the pool gained. The
 * function never carries current down by what the pool lost. A drop only
 * clamps current to the new ceiling. This is the keep-what-is-spent rule the
 * slot and hit-dice syncs need: capacity gained arrives unspent, and losing
 * capacity must not also refund a spent die.
 * @param {ResourcePool} pool
 * @param {number} max
 * @returns {ResourcePool}
 */
export function growMax(pool, max) {
  const current = pool.current + Math.max(0, max - pool.max);
  return { ...pool, max, current: clamp(current, 0, max) };
}

/**
 * @param {ResourcePool} pool
 * @returns {boolean}
 */
export function isEmpty(pool) {
  return pool.current <= 0;
}

/**
 * Swap a family of reserved pools (the slot pools, the hit-dice pools) for a
 * freshly derived set, keeping the rest of the list in order. `owns` picks
 * the family. The replacements land where the first pool of the family sat,
 * so the order the resource card reads survives a level-up.
 *
 * If no pool of the family is present, there is no position to reuse. The
 * replacements then go after the last pool that matches `after`. Pass the
 * pools the family must follow (HP, for example) to give a character their
 * first slot pools in the correct place. `after` defaults to every pool,
 * which appends.
 * @param {ResourcePool[]} resources
 * @param {ResourcePool[]} next
 * @param {(pool: ResourcePool) => boolean} owns
 * @param {(pool: ResourcePool) => boolean} [after]
 * @returns {ResourcePool[]}
 */
export function spliceReservedPools(resources, next, owns, after = () => true) {
  const rest = resources.filter((r) => !owns(r));
  const first = resources.findIndex(owns);
  let at;
  if (first === -1) {
    at = 0;
    rest.forEach((r, i) => {
      if (after(r)) at = i + 1;
    });
  } else {
    at = resources.slice(0, first).filter((r) => !owns(r)).length;
  }
  return [...rest.slice(0, at), ...next, ...rest.slice(at)];
}
