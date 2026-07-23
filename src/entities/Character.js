import { createResource, spend as spendPool, restore as restorePool } from './Resource.js';

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
 * Reserved ResourcePool id for a character's hit points. HP is a regular pool
 * so damage/heal reuse the existing spend/restore machinery; a character
 * without this pool simply has no HP tracking (older saves).
 */
export const HP_RESOURCE_ID = 'hp';

/**
 * @param {Character} character
 * @returns {ResourcePool | null} the character's HP pool, if they have one
 */
export function getHP(character) {
  return character.resources.find((r) => r.id === HP_RESOURCE_ID) ?? null;
}

/**
 * Give a character an HP pool at full health, replacing any existing one.
 * @param {Character} character
 * @param {number} maxHP
 * @returns {Character}
 */
export function withHP(character, maxHP) {
  const hp = createResource(HP_RESOURCE_ID, 'HP', 'custom', maxHP);
  const others = character.resources.filter((r) => r.id !== HP_RESOURCE_ID);
  return { ...character, resources: [hp, ...others] };
}

/**
 * Reserved ResourcePool id for a character's mana. Like HP, mana is a regular
 * pool of `type: 'mana'` so spend/restore reuse the existing machinery; a
 * character without this pool simply has no mana tracking.
 */
export const MANA_RESOURCE_ID = 'mana';

/**
 * @param {Character} character
 * @returns {ResourcePool | null} the character's mana pool, if they have one
 */
export function getMana(character) {
  return character.resources.find((r) => r.id === MANA_RESOURCE_ID) ?? null;
}

/**
 * Give a character a mana pool at full, replacing any existing one. Ordered
 * after HP so the two bars read HP-then-mana on the card.
 * @param {Character} character
 * @param {number} maxMana
 * @returns {Character}
 */
export function withMana(character, maxMana) {
  const mana = createResource(MANA_RESOURCE_ID, 'Mana', 'mana', maxMana);
  const hp = character.resources.filter((r) => r.id === HP_RESOURCE_ID);
  const others = character.resources.filter(
    (r) => r.id !== MANA_RESOURCE_ID && r.id !== HP_RESOURCE_ID,
  );
  return { ...character, resources: [...hp, mana, ...others] };
}

/**
 * Fill in fields a loaded character may predate: any missing ability score at
 * the neutral 10 (keeping existing values) and an empty-string race. No HP
 * pool is invented — its absence legitimately means "no HP tracking".
 * @param {Character} character
 * @returns {Character}
 */
export function withDefaults(character) {
  return {
    ...character,
    race: character.race ?? '',
    stats: { ...defaultStats(), ...character.stats },
    conditions: character.conditions ?? [],
  };
}

/**
 * Create a level 1 character with no resources or inventory. All six ability
 * scores start at 10; `stats` overrides individual scores.
 * @param {string} id
 * @param {string} name
 * @param {Record<string, number>} [stats]
 * @param {string} [race]
 * @returns {Character}
 */
export function createCharacter(id, name, stats = {}, race = '') {
  return { id, name, race, level: 1, xp: 0, stats: { ...defaultStats(), ...stats }, resources: [], inventory: [], conditions: [] };
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
 * Restore every resource pool (HP, mana, and any custom pool) by a fraction of
 * its max, clamped to full. The rest model: a long rest restores everything
 * (fraction 1), a short rest restores half (fraction 0.5). Pure.
 * @param {Character} character
 * @param {number} fraction 0..1
 * @returns {Character}
 */
export function restAll(character, fraction) {
  const clamped = Math.max(0, Math.min(1, fraction));
  return {
    ...character,
    resources: character.resources.map((r) => restorePool(r, Math.ceil(r.max * clamped))),
  };
}

/**
 * A long rest: fully restore HP, mana, and every resource pool.
 * @param {Character} character
 * @returns {Character}
 */
export function longRest(character) {
  return restAll(character, 1);
}

/**
 * A short rest: restore half of each pool's maximum.
 * @param {Character} character
 * @returns {Character}
 */
export function shortRest(character) {
  return restAll(character, 0.5);
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
