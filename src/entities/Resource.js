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
 * Move a pool's max and carry current by the same delta, so a raise grants the
 * points rather than only lifting the ceiling and a drop takes them back.
 * Current stays within [0, max]. This is the re-derive rule: the pool's max is
 * being recomputed from class, level, and stats, and the character should end up
 * where that computation says they are.
 * @param {ResourcePool} pool
 * @param {number} max
 * @returns {ResourcePool}
 */
export function adjustMax(pool, max) {
  const current = pool.current + (max - pool.max);
  return { ...pool, max, current: Math.max(0, Math.min(max, current)) };
}

/**
 * Move a pool's max, carrying current up by what was gained but never down by
 * what was lost — a drop only clamps current to the new ceiling. This is the
 * keep-what-is-spent rule the slot and hit-dice syncs want: capacity gained
 * arrives unspent, and losing capacity must not also refund a spent die.
 * @param {ResourcePool} pool
 * @param {number} max
 * @returns {ResourcePool}
 */
export function growMax(pool, max) {
  const current = pool.current + Math.max(0, max - pool.max);
  return { ...pool, max, current: Math.max(0, Math.min(max, current)) };
}

/**
 * @param {ResourcePool} pool
 * @returns {boolean}
 */
export function isEmpty(pool) {
  return pool.current <= 0;
}

/**
 * Swap out a family of reserved pools (the slot pools, the hit-dice pools) for a
 * freshly derived set, keeping the rest of the list in order. `owns` picks the
 * family. The replacements land where the first pool of the family sat, so the
 * order the resource card reads in survives a level-up.
 *
 * With no pool of the family present there is no position to reuse, so the
 * replacements go after the last pool matching `after` — pass the pools the
 * family should follow (HP, say) to give a character their first slot pools in
 * the right place. `after` defaults to every pool, which appends.
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
