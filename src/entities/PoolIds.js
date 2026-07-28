/**
 * The reserved ResourcePool ids and id prefixes, in one leaf module.
 *
 * HP, spell slots, pact slots, and hit dice are all regular resource pools
 * under ids the app treats as reserved: they get their own UI, their own rest
 * rules, and they are re-derived from the class list rather than authored by
 * hand. The modules that own those rules (`Character.js`, `SpellSlots.js`,
 * `HitDice.js`) sit at different heights in the import graph, so keeping the
 * ids with any one of them left the others re-declaring the string. This module
 * imports nothing, so every one of them can read the id from here, and each
 * re-exports the ids it owns so existing import sites keep working.
 */

/** A character's hit points. A character without this pool has no HP tracking. */
export const HP_RESOURCE_ID = 'hp';

/** Prefix for the per-spell-level slot pools: `slots-3` holds level 3 slots. */
export const SLOT_ID_PREFIX = 'slots-';

/** Prefix for a warlock's pact-magic pool: `pact-3` holds level 3 pact slots. */
export const PACT_ID_PREFIX = 'pact-';

/** Prefix for the per-die-size hit dice pools: `hit-dice-d8` holds the d8s. */
export const HIT_DICE_ID_PREFIX = 'hit-dice-d';

/** The single sizeless hit-dice pool older saves carried, before pools were
 * split by die size. `HitDice.syncHitDice` converts it. */
export const LEGACY_HIT_DICE_ID = 'hit-dice';
