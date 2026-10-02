import { createResource, growMax, spliceReservedPools } from './Resource.js';
import {
  ACTION_SURGE_ID,
  ARCANE_RECOVERY_ID,
  BARDIC_INSPIRATION_ID,
  CHANNEL_DIVINITY_ID,
  CLASS_POOL_IDS,
  DIVINE_SENSE_ID,
  HP_RESOURCE_ID,
  KI_ID,
  LAY_ON_HANDS_ID,
  LEGACY_HIT_DICE_ID,
  PACT_ID_PREFIX,
  RAGE_ID,
  SECOND_WIND_ID,
  SLOT_ID_PREFIX,
  SORCERY_POINTS_ID,
  WILD_SHAPE_ID,
} from './PoolIds.js';
import { classLevelOf } from './Multiclass.js';
import { effectiveStats } from './Equipment.js';
import { abilityModifier } from './Modifiers.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/entities.js').ResourcePool} ResourcePool */
/** @typedef {import('../types/entities.js').Recharge} Recharge */

/**
 * The uses of one class feature at the character's current levels: the
 * pool's maximum and the rest that refills it. A maximum of 0 means the
 * character does not have the feature, or has unlimited uses of it, so the
 * character gets no pool. `shortRestRegain` is the partial refill of a short
 * rest on a long-rest pool.
 * @typedef {{ max: number, recharge: Recharge, shortRestRegain?: number }} PoolUses
 */

/**
 * One class-feature pool: its id, its display name, and how its uses follow
 * from the class levels and the ability modifiers.
 * @typedef {{
 *   id: string,
 *   name: string,
 *   uses: (level: (classId: string) => number, mod: (ability: string) => number) => PoolUses,
 * }} PoolRule
 */

/**
 * Pick the value of the highest tier whose level the class level reaches.
 * @param {number} level
 * @param {[number, number][]} tiers pairs of [from level, value], ascending
 * @returns {number} 0 below the first tier
 */
function tier(level, tiers) {
  let value = 0;
  for (const [from, v] of tiers) if (level >= from) value = v;
  return value;
}

/**
 * The 5e SRD use counts of every class feature that the app tracks as a
 * pool, in the order of `CLASS_POOL_IDS`. Rage has unlimited uses at
 * barbarian level 20, and Wild Shape at druid level 20 (Archdruid), so both
 * rules give 0 there and the pool goes away. Channel Divinity comes from
 * both the cleric and the paladin. A second class that grants it adds its
 * options but no extra use, so the pool takes the larger count.
 * @type {PoolRule[]}
 */
const POOL_RULES = [
  {
    id: SECOND_WIND_ID,
    name: 'Second Wind',
    uses: (level) => ({ max: level('fighter') >= 1 ? 1 : 0, recharge: 'short' }),
  },
  {
    id: ACTION_SURGE_ID,
    name: 'Action Surge',
    uses: (level) => ({
      max: tier(level('fighter'), [
        [2, 1],
        [17, 2],
      ]),
      recharge: 'short',
    }),
  },
  {
    id: RAGE_ID,
    name: 'Rage',
    uses: (level) => ({
      max: tier(level('barbarian'), [
        [1, 2],
        [3, 3],
        [6, 4],
        [12, 5],
        [17, 6],
        [20, 0],
      ]),
      recharge: 'long',
    }),
  },
  {
    id: BARDIC_INSPIRATION_ID,
    name: 'Bardic Inspiration',
    uses: (level, mod) => ({
      max: level('bard') >= 1 ? Math.max(1, mod('CHA')) : 0,
      recharge: level('bard') >= 5 ? 'short' : 'long',
    }),
  },
  {
    id: CHANNEL_DIVINITY_ID,
    name: 'Channel Divinity',
    uses: (level) => ({
      max: Math.max(
        tier(level('cleric'), [
          [2, 1],
          [6, 2],
          [18, 3],
        ]),
        level('paladin') >= 3 ? 1 : 0,
      ),
      recharge: 'short',
    }),
  },
  {
    id: DIVINE_SENSE_ID,
    name: 'Divine Sense',
    uses: (level, mod) => ({
      max: level('paladin') >= 1 ? Math.max(0, 1 + mod('CHA')) : 0,
      recharge: 'long',
    }),
  },
  {
    id: LAY_ON_HANDS_ID,
    name: 'Lay on Hands',
    uses: (level) => ({ max: 5 * level('paladin'), recharge: 'long' }),
  },
  {
    id: KI_ID,
    name: 'Ki points',
    uses: (level) => ({ max: level('monk') >= 2 ? level('monk') : 0, recharge: 'short' }),
  },
  {
    id: WILD_SHAPE_ID,
    name: 'Wild Shape',
    uses: (level) => ({
      max: tier(level('druid'), [
        [2, 2],
        [20, 0],
      ]),
      recharge: 'short',
    }),
  },
  {
    id: SORCERY_POINTS_ID,
    name: 'Sorcery points',
    uses: (level) => ({
      max: level('sorcerer') >= 2 ? level('sorcerer') : 0,
      recharge: 'long',
      // Sorcerous Restoration, sorcerer 20: a short rest regains 4 points.
      ...(level('sorcerer') >= 20 ? { shortRestRegain: 4 } : {}),
    }),
  },
  {
    id: ARCANE_RECOVERY_ID,
    name: 'Arcane Recovery',
    uses: (level) => ({ max: level('wizard') >= 1 ? 1 : 0, recharge: 'long' }),
  },
];

const CLASS_POOL_SET = new Set(CLASS_POOL_IDS);

/**
 * @param {ResourcePool} pool
 * @returns {boolean} true for a pool that the class list derives
 */
export function isClassPool(pool) {
  return CLASS_POOL_SET.has(pool.id);
}

/**
 * The class-feature pools the character's class levels grant, each at full
 * capacity, in the order of `CLASS_POOL_IDS`.
 * @param {Character} character
 * @returns {ResourcePool[]}
 */
export function classPoolsFor(character) {
  const stats = effectiveStats(character);
  /** @param {string} classId */
  const level = (classId) => classLevelOf(character, classId);
  /** @param {string} ability */
  const mod = (ability) => abilityModifier(stats[ability] ?? 10);
  return POOL_RULES.flatMap(({ id, name, uses }) => {
    const { max, ...rest } = uses(level, mod);
    return max > 0 ? [{ ...createResource(id, name, 'custom', max), ...rest }] : [];
  });
}

/**
 * Bring the class-feature pools in line with the class list, the levels, and
 * the ability scores. A pool the class list no longer grants goes away. A
 * pool that grows gains the new uses unspent, and a pool that shrinks keeps
 * what was spent (see `Resource.growMax`). The pools sit after HP, the slot
 * pools, and the hit dice, ahead of the GM's own pools. A character whose
 * class pools already match returns unchanged, with identity preserved.
 * @param {Character} character
 * @returns {Character}
 */
export function syncClassPools(character) {
  const existing = character.resources.filter(isClassPool);
  const next = classPoolsFor(character).map((fresh) => {
    const old = existing.find((r) => r.id === fresh.id);
    return old === undefined ? fresh : { ...fresh, current: growMax(old, fresh.max).current };
  });
  const unchanged =
    existing.length === next.length &&
    existing.every(
      (r, i) =>
        r.id === next[i].id &&
        r.name === next[i].name &&
        r.max === next[i].max &&
        r.current === next[i].current &&
        r.recharge === next[i].recharge &&
        r.shortRestRegain === next[i].shortRestRegain,
    );
  if (unchanged) return character;
  return {
    ...character,
    resources: spliceReservedPools(character.resources, next, isClassPool, isDerivedFirst),
  };
}

/**
 * @param {ResourcePool} pool
 * @returns {boolean} true for HP, a slot pool, a pact pool, or a hit-dice pool
 */
function isDerivedFirst(pool) {
  return (
    pool.id === HP_RESOURCE_ID ||
    pool.id.startsWith(SLOT_ID_PREFIX) ||
    pool.id.startsWith(PACT_ID_PREFIX) ||
    pool.id.startsWith(LEGACY_HIT_DICE_ID)
  );
}
