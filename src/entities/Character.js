import { createResource, spend as spendPool, restore as restorePool } from './Resource.js';
import { isSlotPool, syncSlotsToLevel, migrateManaToSlots } from './SpellSlots.js';
import { emptyEquipment, pruneEquipment } from './Equipment.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/entities.js').ResourcePool} ResourcePool */
/** @typedef {import('../types/entities.js').InventoryItem} InventoryItem */

/** XP required to go from level N to N+1 is N * XP_PER_LEVEL. */
export const XP_PER_LEVEL = 100;

/** The six ability scores every character carries, in conventional order. */
export const ABILITY_SCORES = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];

/** @returns {Record<string, number>} every ability score at the neutral 10 */
export function defaultStats() {
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
 * Fill in fields a loaded character may predate: any missing ability score at
 * the neutral 10 (keeping existing values) and an empty-string race. No HP
 * pool is invented — its absence legitimately means "no HP tracking". A
 * mana-era save's mana pool is migrated to spell slots for the character's
 * level (see SpellSlots.js), and a pre-equipment save gets empty slots.
 * @param {Character} character
 * @returns {Character}
 */
export function withDefaults(character) {
  return migrateManaToSlots({
    ...character,
    race: character.race ?? '',
    stats: { ...defaultStats(), ...character.stats },
    conditions: character.conditions ?? [],
    equipment: { ...emptyEquipment(), ...character.equipment },
  });
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
  return { id, name, race, level: 1, xp: 0, stats: { ...defaultStats(), ...stats }, resources: [], inventory: [], conditions: [], equipment: emptyEquipment() };
}

/**
 * Default per-level growth for a pool: a tenth of its maximum, at least 1, so a
 * bigger pool scales faster while a small one still grows each level.
 * @param {number} max
 * @returns {number}
 */
function defaultGrowth(max) {
  return Math.max(1, Math.ceil(max * 0.1));
}

/**
 * Add XP, auto-leveling up (possibly multiple times) as thresholds are crossed.
 * Each level gained grows the HP pool's maximum (and current, so the gained
 * capacity is immediately usable) by a per-level amount — configurable via
 * `opts`, defaulting to a tenth of the pool's current max — and re-derives a
 * caster's spell-slot pools from the new level (spent slots stay spent).
 * Characters with no HP pool level up without any pool change.
 * @param {Character} character
 * @param {number} amount
 * @param {{ hpGrowth?: number }} [opts]
 * @returns {Character}
 */
export function addXP(character, amount, opts = {}) {
  let { level, xp } = character;
  const startLevel = level;
  xp += amount;
  while (xp >= level * XP_PER_LEVEL) {
    xp -= level * XP_PER_LEVEL;
    level += 1;
  }
  const gained = level - startLevel;
  if (gained === 0) return { ...character, level, xp };

  const resources = character.resources.map((r) => {
    if (r.id !== HP_RESOURCE_ID) return r;
    const added = (opts.hpGrowth ?? defaultGrowth(r.max)) * gained;
    return { ...r, max: r.max + added, current: Math.min(r.max + added, r.current + added) };
  });
  return syncSlotsToLevel({ ...character, level, xp, resources });
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
 * Restore every resource pool (HP and any custom pool) by a fraction of its
 * max, clamped to full. The rest model: a long rest restores everything
 * (fraction 1), a short rest restores half (fraction 0.5). Spell slots follow
 * the D&D rule instead: only a full rest (fraction 1) refills them; anything
 * less leaves them untouched. Pure.
 * @param {Character} character
 * @param {number} fraction 0..1
 * @returns {Character}
 */
export function restAll(character, fraction) {
  const clamped = Math.max(0, Math.min(1, fraction));
  return {
    ...character,
    resources: character.resources.map((r) =>
      isSlotPool(r) && clamped < 1 ? r : restorePool(r, Math.ceil(r.max * clamped)),
    ),
  };
}

/**
 * A long rest: fully restore HP, spell slots, and every resource pool.
 * @param {Character} character
 * @returns {Character}
 */
export function longRest(character) {
  return restAll(character, 1);
}

/**
 * A short rest: restore half of each pool's maximum; spell slots stay spent.
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
 * Remove quantity from a stack, dropping it from the inventory entirely once
 * it hits 0 — and unequipping it from any slot it occupied.
 * @param {Character} character
 * @param {string} itemId
 * @param {number} quantity
 * @returns {Character}
 */
export function removeItem(character, itemId, quantity) {
  const inventory = character.inventory
    .map((i) => (i.id === itemId ? { ...i, quantity: Math.max(0, i.quantity - quantity) } : i))
    .filter((i) => i.quantity > 0);
  return pruneEquipment({ ...character, inventory });
}
