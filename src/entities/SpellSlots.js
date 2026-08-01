import { createResource, growMax, spliceReservedPools } from './Resource.js';
import { HP_RESOURCE_ID, SLOT_ID_PREFIX, PACT_ID_PREFIX } from './PoolIds.js';
import { getClasses } from './Multiclass.js';
import { DEFAULT_CLASSES } from '../data/classes.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/entities.js').ResourcePool} ResourcePool */
/** @typedef {import('../types/entities.js').SpellCaster} SpellCaster */
/** @typedef {{ resources: ResourcePool[] }} PoolHolder */

/**
 * Spell slots are regular resource pools under reserved ids, `slots-1`
 * through `slots-9`, one per spell level. This lets spend, restore, and
 * level-up reuse the pool machinery. A character with no slot pools is not a
 * caster. The maxima derive from the character's class list through
 * `characterSlots`. Only long rests refill them (see Character.js's
 * restAll).
 *
 * Warlock pact slots are a separate pool under a `pact-N` id, where N is the
 * slot level that every pact slot is cast at. Unlike leveled slots, pact
 * slots refill on a short rest and never join the multiclass combined caster
 * level.
 *
 * Both prefixes are declared in PoolIds.js with the other reserved pool ids.
 * This module re-exports them because slot code is their natural import
 * site.
 */
export { SLOT_ID_PREFIX, PACT_ID_PREFIX } from './PoolIds.js';

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

/** The slot table for each caster type. Pact and none carry no leveled-slot
 * table here, because pact magic is special-cased and none has no slots.
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
 * @returns {number[]} index 0 is spell level 1, empty for level < 1
 */
export function slotsForLevel(characterLevel) {
  return slotsForCaster('full', characterLevel);
}

/**
 * Slot counts per spell level for a caster of the given type and character
 * level. Non-slot caster types (pact, none, or any unknown) get no slots.
 * @param {import('../types/class.js').CasterType} casterType
 * @param {number} characterLevel
 * @returns {number[]} index 0 is spell level 1, empty when the caster has none
 */
export function slotsForCaster(casterType, characterLevel) {
  const table = CASTER_TABLES[casterType];
  if (!table || characterLevel < 1) return [];
  return table[Math.min(characterLevel, table.length) - 1];
}

/**
 * Slot counts for a combined caster level, read from the full-caster table.
 * This table doubles as the 5e multiclass spellcaster table. The
 * single-class paths above use the dedicated half and third tables, because
 * a lone paladin's slots differ from a multiclassed paladin's slots. This is
 * the lookup that the deferred multiclass path uses after it sums per-class
 * contributions.
 * @param {number} combinedLevel
 * @returns {number[]} index 0 is spell level 1, empty for level < 1
 */
export function slotsForCasterLevel(combinedLevel) {
  return slotsForCaster('full', combinedLevel);
}

/**
 * One class's contribution to a character's combined caster level. A full
 * caster counts its whole level. A half caster counts half its level,
 * rounded down. A third caster counts a third of its level, rounded down.
 * Pact and none contribute nothing to the shared slot pool, because warlock
 * pact slots stay a separate pool. The deferred multiclass work sums these
 * contributions across classes and feeds slotsForCasterLevel. Single-class
 * callers do not need this function. This function is pure.
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
 * The pact-magic progression (SRD warlock): every pact slot sits at one shared
 * slot level, and the whole pool refills on a short rest. Pure.
 * @param {number} classLevel the character's combined pact-caster level
 * @returns {{ count: number, level: number } | null} null below level 1
 */
export function pactSlotsFor(classLevel) {
  const level = Math.floor(classLevel);
  if (level < 1) return null;
  const count = level >= 17 ? 4 : level >= 11 ? 3 : level >= 2 ? 2 : 1;
  return { count, level: Math.min(5, Math.ceil(Math.min(level, 9) / 2)) };
}

/**
 * @param {ResourcePool} pool
 * @returns {boolean} whether the pool is a reserved spell-slot pool
 */
export function isSlotPool(pool) {
  return pool.id.startsWith(SLOT_ID_PREFIX);
}

/**
 * @param {ResourcePool} pool
 * @returns {boolean} whether the pool is the pact-magic slot pool
 */
export function isPactPool(pool) {
  return pool.id.startsWith(PACT_ID_PREFIX);
}

/**
 * A character's slot pools, ordered by spell level.
 * @param {PoolHolder} character
 * @returns {ResourcePool[]} empty for non-casters
 */
export function getSlotPools(character) {
  // `filter` already returned a fresh array, so sorting in place cannot
  // reorder the character's own resource list.
  return character.resources.filter(isSlotPool).sort((a, b) => slotLevelOf(a) - slotLevelOf(b));
}

/**
 * The character's pact-magic pool, or null for a non-pact caster.
 * @param {PoolHolder} character
 * @returns {ResourcePool | null}
 */
export function getPactPool(character) {
  return character.resources.find(isPactPool) ?? null;
}

/**
 * @param {ResourcePool} pool a slot or pact pool
 * @returns {number} its spell level (`slots-3` -> 3, `pact-2` -> 2)
 */
export function slotLevelOf(pool) {
  const prefix = isPactPool(pool) ? PACT_ID_PREFIX : SLOT_ID_PREFIX;
  return Number(pool.id.slice(prefix.length));
}

/** @param {number} spellLevel @param {number} max @returns {ResourcePool} */
function slotPool(spellLevel, max) {
  return createResource(`${SLOT_ID_PREFIX}${spellLevel}`, `Level ${spellLevel} slots`, 'mana', max);
}

/** @param {{ count: number, level: number }} pact @returns {ResourcePool} */
function pactPool(pact) {
  return createResource(
    `${PACT_ID_PREFIX}${pact.level}`,
    `Pact slots (level ${pact.level})`,
    'mana',
    pact.count,
  );
}

/**
 * The slot pools for a caster of the given type and level, all at full. This
 * is the standalone builder used for foes and NPCs, which, unlike
 * characters, carry no HP pool to order around. A non-slot caster type gets
 * an empty list.
 * @param {import('../types/class.js').CasterType} casterType
 * @param {number} level
 * @returns {ResourcePool[]}
 */
export function slotPoolsForCaster(casterType, level) {
  return slotsForCaster(casterType, level).map((max, i) => slotPool(i + 1, max));
}

/** The caster type that each class id maps to, read straight from the class
 * catalog. SpellSlots cannot import Classes.js, because Classes.js imports
 * this module, so the lookup is built here from the shared data.
 * @type {Map<string, import('../types/class.js').CasterType>} */
const CASTER_TYPE_BY_ID = new Map(DEFAULT_CLASSES.map((c) => [c.id, c.casterType]));

/** @param {SpellCaster} character @returns {{ classId: string, level: number,
 *   casterType: import('../types/class.js').CasterType }[]} */
function casterEntries(character) {
  return getClasses(character)
    .map((ref) => ({ ...ref, casterType: CASTER_TYPE_BY_ID.get(ref.classId) ?? 'none' }))
    .filter((ref) => ref.casterType !== 'none');
}

/**
 * The leveled slot counts that a character's class list grants, per the 5e
 * multiclass rules. A single slot-granting caster class reads its own table
 * at its class level. Two or more classes read the multiclass, full-caster,
 * table at the summed per-class contributions. A pact caster contributes
 * nothing here, because its slots come from `characterPactSlots`. A
 * classless character keeps the old full-caster-at-character-level
 * behavior, so a hand-built caster without a class still works.
 * @param {SpellCaster} character
 * @returns {number[]} index 0 = spell level 1
 */
export function characterSlots(character) {
  const casters = casterEntries(character);
  if (casters.length === 0) return slotsForLevel(character.level);
  const slotClasses = casters.filter((c) => c.casterType !== 'pact');
  if (slotClasses.length === 0) return [];
  if (slotClasses.length === 1) {
    return slotsForCaster(slotClasses[0].casterType, slotClasses[0].level);
  }
  const combined = slotClasses.reduce(
    (sum, c) => sum + casterLevelContribution(c.casterType, c.level),
    0,
  );
  return slotsForCasterLevel(combined);
}

/**
 * The pact-magic slots that a character's class list grants. The function
 * reads the pact progression at the summed pact-caster class levels. The
 * result is null with no pact class.
 * @param {SpellCaster} character
 * @returns {{ count: number, level: number } | null}
 */
export function characterPactSlots(character) {
  const pactLevel = casterEntries(character)
    .filter((c) => c.casterType === 'pact')
    .reduce((sum, c) => sum + c.level, 0);
  return pactSlotsFor(pactLevel);
}

/**
 * The highest slot level that a character can cast from, across leveled and
 * pact pools. The result is 0 for a non-caster.
 * @param {PoolHolder} character
 * @returns {number}
 */
export function highestSlotLevel(character) {
  const pact = getPactPool(character);
  return getSlotPools(character).reduce(
    (m, p) => Math.max(m, slotLevelOf(p)),
    pact ? slotLevelOf(pact) : 0,
  );
}

/**
 * The slot levels that a caster can currently cast a spell of `minLevel` at.
 * The result lists each leveled or pact pool at or above that level with a
 * charge left, deduplicated and in ascending order. This backs the cast
 * dialog's slot picker.
 * @param {PoolHolder} character
 * @param {number} minLevel the spell's own level
 * @returns {number[]}
 */
export function castableSlotLevels(character, minLevel) {
  const pact = getPactPool(character);
  const pools = [...getSlotPools(character), ...(pact ? [pact] : [])];
  const levels = pools.filter((p) => p.current > 0 && slotLevelOf(p) >= minLevel).map(slotLevelOf);
  return [...new Set(levels)].sort((a, b) => a - b);
}

/**
 * Make a character a spellcaster: replace any existing slot and pact pools
 * with the ones their class list grants (`characterSlots` and
 * `characterPactSlots`), all at full. Ordered after HP so the card reads
 * HP-then-slots.
 * @param {Character} character
 * @returns {Character}
 */
export function withSpellSlots(character) {
  const slots = characterSlots(character).map((max, i) => slotPool(i + 1, max));
  const pact = characterPactSlots(character);
  const resources = spliceReservedPools(
    character.resources,
    [...slots, ...(pact ? [pactPool(pact)] : [])],
    isCasterPool,
    (r) => r.id === HP_RESOURCE_ID,
  );
  return { ...character, resources };
}

/** @param {ResourcePool} pool @returns {boolean} a leveled or pact slot pool */
export function isCasterPool(pool) {
  return isSlotPool(pool) || isPactPool(pool);
}

/**
 * Re-derive a caster's slot maxima from the class levels, since they can
 * change, keeping what is already spent. Each pool's current value grows by exactly
 * the capacity gained, and a newly unlocked spell level arrives at full. The
 * pact pool syncs the same way, and its slot level follows the pact class
 * levels up, with the spent count carried across the id change. A
 * non-caster, with no slot or pact pools, returns unchanged, so leveling a
 * martial character never invents slots.
 * @param {Character} character
 * @returns {Character}
 */
export function syncSlotsToLevel(character) {
  const existing = getSlotPools(character);
  const priorPact = getPactPool(character);
  if (existing.length === 0 && !priorPact) return character;
  const table = characterSlots(character);
  /** @type {Map<number, ResourcePool>} */
  const byLevel = new Map(existing.map((p) => [slotLevelOf(p), p]));

  /** @type {ResourcePool[]} */
  const synced = table.map((max, i) => {
    const prior = byLevel.get(i + 1);
    return prior ? growMax(prior, max) : slotPool(i + 1, max);
  });

  const pact = characterPactSlots(character);
  /** @type {ResourcePool[]} */
  let syncedPact = [];
  if (pact) {
    const fresh = pactPool(pact);
    // The pool is rebuilt because its id carries the slot level, which follows
    // the pact class's levels up. Only the spent count carries over.
    syncedPact = [
      priorPact ? { ...fresh, current: growMax(priorPact, pact.count).current } : fresh,
    ];
  }

  const resources = spliceReservedPools(
    character.resources,
    [...synced, ...syncedPact],
    isCasterPool,
  );
  return { ...character, resources };
}
