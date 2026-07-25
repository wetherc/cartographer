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
 * Half-caster slot progression (Paladin, Ranger): no slots at level 1, then
 * first slots at 2 and topping out at 5th-level slots. Same row semantics as
 * SLOT_TABLE.
 * @type {number[][]}
 */
const HALF_SLOT_TABLE = [
  [],
  [2],
  [3],
  [3],
  [4, 2],
  [4, 2],
  [4, 3],
  [4, 3],
  [4, 3, 2],
  [4, 3, 2],
  [4, 3, 3],
  [4, 3, 3],
  [4, 3, 3, 1],
  [4, 3, 3, 1],
  [4, 3, 3, 2],
  [4, 3, 3, 2],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2],
];

/**
 * Third-caster slot progression (Eldritch Knight, Arcane Trickster): no slots
 * until level 3, topping out at 4th-level slots.
 * @type {number[][]}
 */
const THIRD_SLOT_TABLE = [
  [],
  [],
  [2],
  [3],
  [3],
  [3],
  [4, 2],
  [4, 2],
  [4, 2],
  [4, 3],
  [4, 3],
  [4, 3],
  [4, 3, 2],
  [4, 3, 2],
  [4, 3, 2],
  [4, 3, 3],
  [4, 3, 3],
  [4, 3, 3],
  [4, 3, 3, 1],
  [4, 3, 3, 1],
];

/** The slot table for each caster type; pact and none carry no leveled-slot
 * table here (pact magic is special-cased, none has no slots).
 * @type {Record<string, number[][] | undefined>} */
const CASTER_TABLES = {
  full: SLOT_TABLE,
  half: HALF_SLOT_TABLE,
  third: THIRD_SLOT_TABLE,
};

/**
 * Slot counts per spell level for a full caster of the given character level
 * (1-based both ways). Retained for the full-caster default path.
 * @param {number} characterLevel
 * @returns {number[]} index 0 = spell level 1; empty for level < 1
 */
export function slotsForLevel(characterLevel) {
  return slotsForCaster('full', characterLevel);
}

/**
 * Slot counts per spell level for a caster of the given type and character
 * level. Non-slot caster types (pact, none, or any unknown) get no slots.
 * @param {import('../types/class.js').CasterType} casterType
 * @param {number} characterLevel
 * @returns {number[]} index 0 = spell level 1; empty when the caster has none
 */
export function slotsForCaster(casterType, characterLevel) {
  const table = CASTER_TABLES[casterType];
  if (!table || characterLevel < 1) return [];
  return table[Math.min(characterLevel, table.length) - 1];
}

/**
 * Slot counts for a combined caster level, read from the full-caster table —
 * which doubles as the 5e *multiclass* spellcaster table. The single-class
 * paths above use the dedicated half/third tables (a lone paladin's slots
 * differ from a multiclassed one's); this is the lookup the deferred multiclass
 * path uses after summing per-class contributions. See PLAN.md's multiclass
 * design decision.
 * @param {number} combinedLevel
 * @returns {number[]} index 0 = spell level 1; empty for level < 1
 */
export function slotsForCasterLevel(combinedLevel) {
  return slotsForCaster('full', combinedLevel);
}

/**
 * One class's contribution to a character's combined caster level: full casters
 * count their whole level, half casters half (rounded down), third casters a
 * third (rounded down), and pact/none contribute nothing to the shared slot
 * pool (warlock pact slots stay a separate pool). The deferred multiclass work
 * sums these across classes and feeds slotsForCasterLevel; single-class callers
 * don't need it. Pure.
 * @param {import('../types/class.js').CasterType} casterType
 * @param {number} classLevel
 * @returns {number} caster levels this class contributes
 */
export function casterLevelContribution(casterType, classLevel) {
  if (classLevel < 1) return 0;
  switch (casterType) {
    case 'full':
      return classLevel;
    case 'half':
      return Math.floor(classLevel / 2);
    case 'third':
      return Math.floor(classLevel / 3);
    default:
      return 0;
  }
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
 * The slot pools for a caster of the given type and level, all at full — the
 * standalone builder used for foes and NPCs, which (unlike characters) carry no
 * HP pool to order around. A non-slot caster type gets an empty list.
 * @param {import('../types/class.js').CasterType} casterType
 * @param {number} level
 * @returns {ResourcePool[]}
 */
export function slotPoolsForCaster(casterType, level) {
  return slotsForCaster(casterType, level).map((max, i) => slotPool(i + 1, max));
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
