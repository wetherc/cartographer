/**
 * This module holds the reserved ResourcePool ids and id prefixes.
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
