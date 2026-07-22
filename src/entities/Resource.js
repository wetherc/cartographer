/** @typedef {import('../types/entities.js').ResourcePool} ResourcePool */
/** @typedef {import('../types/entities.js').ResourceType} ResourceType */

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
 * @param {ResourcePool} pool
 * @returns {boolean}
 */
export function isEmpty(pool) {
  return pool.current <= 0;
}
