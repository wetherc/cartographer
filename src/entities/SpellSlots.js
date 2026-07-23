import { createResource } from './Resource.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/entities.js').ResourcePool} ResourcePool */

/**
 * Spell slots are regular resource pools under reserved ids (`slots-1` ..
 * `slots-9`, one per spell level), so spend/restore/level-up reuse the pool
 * machinery. A character with no slot pools simply isn't a caster. The maxima
 * come from the standard full-caster table below and track character level;
 * only long rests refill them (see Character.js's restAll).
 */
export const SLOT_ID_PREFIX = 'slots-';

/**
 * Full-caster slot progression (SRD): SLOT_TABLE[characterLevel - 1][spellLevel - 1]
 * is the slot count for that spell level. Levels past 20 use the level-20 row.
 * @type {number[][]}
 */
const SLOT_TABLE = [
  [2],
  [3],
  [4, 2],
  [4, 3],
  [4, 3, 2],
  [4, 3, 3],
  [4, 3, 3, 1],
  [4, 3, 3, 2],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

/**
 * Slot counts per spell level for a character level (1-based both ways).
 * @param {number} characterLevel
 * @returns {number[]} index 0 = spell level 1; empty for level < 1
 */
export function slotsForLevel(characterLevel) {
  if (characterLevel < 1) return [];
  return SLOT_TABLE[Math.min(characterLevel, SLOT_TABLE.length) - 1];
}

/**
 * @param {ResourcePool} pool
 * @returns {boolean} whether the pool is a reserved spell-slot pool
 */
export function isSlotPool(pool) {
  return pool.id.startsWith(SLOT_ID_PREFIX);
}

/**
 * A character's slot pools, ordered by spell level.
 * @param {Character} character
 * @returns {ResourcePool[]} empty for non-casters
 */
export function getSlotPools(character) {
  return character.resources
    .filter(isSlotPool)
    .slice()
    .sort((a, b) => slotLevelOf(a) - slotLevelOf(b));
}

/**
 * @param {ResourcePool} pool a slot pool
 * @returns {number} its spell level (`slots-3` -> 3)
 */
export function slotLevelOf(pool) {
  return Number(pool.id.slice(SLOT_ID_PREFIX.length));
}

/** @param {number} spellLevel @param {number} max @returns {ResourcePool} */
function slotPool(spellLevel, max) {
  return createResource(`${SLOT_ID_PREFIX}${spellLevel}`, `Level ${spellLevel} slots`, 'mana', max);
}

/**
 * Make a character a spellcaster: replace any existing slot pools with the
 * full-caster table's pools for their level, all at full. Ordered after HP so
 * the card reads HP-then-slots.
 * @param {Character} character
 * @returns {Character}
 */
export function withSpellSlots(character) {
  const hp = character.resources.filter((r) => r.id === 'hp');
  const others = character.resources.filter((r) => r.id !== 'hp' && !isSlotPool(r));
  const slots = slotsForLevel(character.level).map((max, i) => slotPool(i + 1, max));
  return { ...character, resources: [...hp, ...slots, ...others] };
}

/**
 * Re-derive a caster's slot maxima from their (possibly new) level, keeping
 * what's spent: each pool's current grows by exactly the capacity gained, and
 * newly unlocked spell levels arrive at full. A non-caster (no slot pools) is
 * returned unchanged, so leveling a martial character never invents slots.
 * @param {Character} character
 * @returns {Character}
 */
export function syncSlotsToLevel(character) {
  const existing = getSlotPools(character);
  if (existing.length === 0) return character;
  const table = slotsForLevel(character.level);
  /** @type {Map<number, ResourcePool>} */
  const byLevel = new Map(existing.map((p) => [slotLevelOf(p), p]));

  /** @type {ResourcePool[]} */
  const synced = table.map((max, i) => {
    const prior = byLevel.get(i + 1);
    if (!prior) return slotPool(i + 1, max);
    const gained = Math.max(0, max - prior.max);
    return { ...prior, max, current: Math.min(max, prior.current + gained) };
  });

  // Splice the synced pools in at the position of the first slot pool, so the
  // HP-then-slots-then-custom order on the card survives a level-up.
  const firstIdx = character.resources.findIndex(isSlotPool);
  const rest = character.resources.filter((r) => !isSlotPool(r));
  const resources = [...rest.slice(0, firstIdx), ...synced, ...rest.slice(firstIdx)];
  return { ...character, resources };
}

/**
 * Back-compat for saves from the mana era: a character carrying the old
 * `mana` pool becomes a caster with the slot pools for their level (fresh, at
 * full — spent mana doesn't map to spent slots), and the mana pool is dropped.
 * Characters without a mana pool are untouched.
 * @param {Character} character
 * @returns {Character}
 */
export function migrateManaToSlots(character) {
  if (!character.resources.some((r) => r.id === 'mana')) return character;
  const withoutMana = {
    ...character,
    resources: character.resources.filter((r) => r.id !== 'mana'),
  };
  return withSpellSlots(withoutMana);
}
