import { spend as spendPool, restore as restorePool } from './Resource.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/entities.js').ResourcePool} ResourcePool */
/** @typedef {import('../types/entities.js').InventoryItem} InventoryItem */

/** XP required to go from level N to N+1 is N * XP_PER_LEVEL. */
export const XP_PER_LEVEL = 100;

/** The six ability scores every character carries, in conventional order. */
export const ABILITY_SCORES = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];

/** @returns {Record<string, number>} every ability score at the neutral 10 */
function defaultStats() {
  return Object.fromEntries(ABILITY_SCORES.map((key) => [key, 10]));
}

/**
 * Fill in any ability score a character is missing at the neutral 10, keeping
 * existing values. Applied to loaded saves so characters created before the
 * full six-score set existed still render a complete sheet.
 * @param {Character} character
 * @returns {Character}
 */
export function withDefaultStats(character) {
  return { ...character, stats: { ...defaultStats(), ...character.stats } };
}

/**
 * Create a level 1 character with no resources or inventory. All six ability
 * scores start at 10; `stats` overrides individual scores.
 * @param {string} id
 * @param {string} name
 * @param {Record<string, number>} [stats]
 * @returns {Character}
 */
export function createCharacter(id, name, stats = {}) {
  return { id, name, level: 1, xp: 0, stats: { ...defaultStats(), ...stats }, resources: [], inventory: [] };
}

/**
 * Add XP, auto-leveling up (possibly multiple times) as thresholds are crossed.
 * @param {Character} character
 * @param {number} amount
 * @returns {Character}
 */
export function addXP(character, amount) {
  let { level, xp } = character;
  xp += amount;
  while (xp >= level * XP_PER_LEVEL) {
    xp -= level * XP_PER_LEVEL;
    level += 1;
  }
  return { ...character, level, xp };
}

/**
 * @param {Character} character
 * @param {string} key
 * @param {number} value
 * @returns {Character}
 */
export function setStat(character, key, value) {
  return { ...character, stats: { ...character.stats, [key]: value } };
}

/**
 * @param {Character} character
 * @param {ResourcePool} pool
 * @returns {Character}
 */
export function addResource(character, pool) {
  return { ...character, resources: [...character.resources, pool] };
}

/**
 * @param {Character} character
 * @param {string} resourceId
 * @param {number} amount
 * @returns {Character}
 */
export function spendResource(character, resourceId, amount) {
  return {
    ...character,
    resources: character.resources.map((r) => (r.id === resourceId ? spendPool(r, amount) : r)),
  };
}

/**
 * @param {Character} character
 * @param {string} resourceId
 * @param {number} amount
 * @returns {Character}
 */
export function restoreResource(character, resourceId, amount) {
  return {
    ...character,
    resources: character.resources.map((r) => (r.id === resourceId ? restorePool(r, amount) : r)),
  };
}

/**
 * Add an item, merging quantity into an existing stack with the same id.
 * @param {Character} character
 * @param {InventoryItem} item
 * @returns {Character}
 */
export function addItem(character, item) {
  const existing = character.inventory.find((i) => i.id === item.id);
  if (!existing) return { ...character, inventory: [...character.inventory, item] };

  return {
    ...character,
    inventory: character.inventory.map((i) =>
      i.id === item.id ? { ...i, quantity: i.quantity + item.quantity } : i,
    ),
  };
}

/**
 * Remove quantity from a stack, dropping it from the inventory entirely once it hits 0.
 * @param {Character} character
 * @param {string} itemId
 * @param {number} quantity
 * @returns {Character}
 */
export function removeItem(character, itemId, quantity) {
  const inventory = character.inventory
    .map((i) => (i.id === itemId ? { ...i, quantity: Math.max(0, i.quantity - quantity) } : i))
    .filter((i) => i.quantity > 0);
  return { ...character, inventory };
}
