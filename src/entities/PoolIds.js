/**
 * This module keeps the reserved ResourcePool ids and id prefixes.
 *
 * HP, spell slots, pact slots, and hit dice are resource pools with reserved
 * ids. Each pool gets its own UI and its own rest rules. The app derives each
 * pool from the class list instead of a hand-authored value.
 *
 * The modules that own these rules (`Character.js`, `SpellSlots.js`,
 * `HitDice.js`) sit at different levels in the import graph. If one module
 * owns the ids, the other modules redeclare the same string. This
 * module imports nothing, so every other module can read the id from here.
 * Each module re-exports the ids it owns, so existing import sites keep
 * working.
 */

/** A character's hit points. A character without this pool has no HP tracking. */
export const HP_RESOURCE_ID = 'hp';

/** Prefix for the per-spell-level slot pools: `slots-3` holds level 3 slots. */
export const SLOT_ID_PREFIX = 'slots-';

/** Prefix for a warlock's pact-magic pool: `pact-3` holds level 3 pact slots. */
export const PACT_ID_PREFIX = 'pact-';

/** Prefix for the per-die-size hit dice pools: `hit-dice-d8` holds the d8s. */
export const HIT_DICE_ID_PREFIX = 'hit-dice-d';

/** Older saves carried one hit-dice pool with no die size, before the app
 * split pools by die size. `HitDice.syncHitDice` converts it. */
export const LEGACY_HIT_DICE_ID = 'hit-dice';

/*
 * Class-feature pools. The app derives each of these pools from the class
 * list and the level (see `ClassPools.js`). Other modules, such as the combat
 * actions that spend a use, name a pool by these ids.
 */

/** Fighter: Second Wind, 1 use per short rest. */
export const SECOND_WIND_ID = 'second-wind';

/** Fighter: Action Surge, 1 use per short rest (2 from level 17). */
export const ACTION_SURGE_ID = 'action-surge';

/** Cleric and paladin: Channel Divinity uses, per short rest. */
export const CHANNEL_DIVINITY_ID = 'channel-divinity';

/** Barbarian: Rage uses, per long rest. */
export const RAGE_ID = 'rage';

/** Paladin: the Lay on Hands pool of hit points, per long rest. */
export const LAY_ON_HANDS_ID = 'lay-on-hands';

/** Bard: Bardic Inspiration uses, per long rest (short rest from level 5). */
export const BARDIC_INSPIRATION_ID = 'bardic-inspiration';

/** Monk: ki points, per short rest. */
export const KI_ID = 'ki';

/** Druid: Wild Shape uses, per short rest. */
export const WILD_SHAPE_ID = 'wild-shape';

/** Sorcerer: sorcery points, per long rest. */
export const SORCERY_POINTS_ID = 'sorcery-points';

/** Wizard: Arcane Recovery, 1 use per long rest. */
export const ARCANE_RECOVERY_ID = 'arcane-recovery';

/** Paladin: Divine Sense uses, per long rest. */
export const DIVINE_SENSE_ID = 'divine-sense';

/** Every class-feature pool id, in the order the resource card lists them. */
export const CLASS_POOL_IDS = Object.freeze([
  SECOND_WIND_ID,
  ACTION_SURGE_ID,
  RAGE_ID,
  BARDIC_INSPIRATION_ID,
  CHANNEL_DIVINITY_ID,
  DIVINE_SENSE_ID,
  LAY_ON_HANDS_ID,
  KI_ID,
  WILD_SHAPE_ID,
  SORCERY_POINTS_ID,
  ARCANE_RECOVERY_ID,
]);
