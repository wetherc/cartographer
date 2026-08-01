/**
 * The campaign save's schema version, and the step transforms that carry an
 * older save forward to the current version. The code is pure and stays
 * separate from `SaveManager.js`. A migration reads a shape the current
 * validator otherwise flattens or removes, so it must run on the raw
 * parsed object before that validator runs. Keeping the table here stops
 * SaveManager from gaining a second concern each time the on-disk shape
 * changes.
 *
 * Every back-compatibility path before this one inferred an older save from
 * the absence of a field. Field absence cannot express a semantic change: a
 * field that is present but means something different (packed tiles,
 * hoisted image assets, a weapon's properties replacing its `handling`
 * enum) looks the same as the current shape without a version to compare.
 */

/** @typedef {import('../types/storage.js').RawSave} RawSave */
/** @typedef {import('../types/storage.js').MigrationStep} MigrationStep */

/**
 * The schema version `buildState` stamps on every save it writes. Version 0
 * is every save written before this field existed.
 */
export const CURRENT_VERSION = 5;

/**
 * Step transforms keyed by the version being migrated from. `MIGRATIONS[n]`
 * takes a version-n raw save and returns a version-(n+1) one. Each step
 * receives untrusted data and must defend itself against it.
 * @type {Record<number, MigrationStep>}
 */
export const MIGRATIONS = {
  // 0 -> 1: version 1 adds the `version` field and nothing else.
  // `deserialize` stamps this field, so a version-0 payload is already a
  // valid version-1 one.
  0: (state) => state,
  // 1 -> 2: version 2 omits default-valued tile fields from the serialized
  // nodes. Both directions only omit fields, so no payload transform is
  // needed. A version-1 save writes every field explicitly, and the load
  // path's tile-defaults fill step leaves it unchanged. A later step reads
  // the stamped version to tell a field omitted on purpose from one that
  // was lost.
  1: (state) => state,
  // 2 -> 3: version 3 hoists inline `data:` image payloads into an `assets`
  // table, and replaces each with a short reference. Both directions again
  // only omit fields. A version-2 save carries no table and no reference,
  // so the load path's restore pass finds nothing to do. Every step runs
  // before that restore step, so a later step that reads an image payload
  // must resolve it through the table, not expect it inline.
  2: (state) => state,
  // 3 -> 4: version 4 omits the fields that each entity's `withDefaults`
  // restores. This extends version 2's tile packing to characters,
  // encounters, NPCs, and handouts. Both directions again only omit fields.
  // A version-3 save names every field explicitly, and the load path runs
  // those same `withDefaults` whether a field was omitted or not.
  3: (state) => state,
  // 4 -> 5: version 5 encodes a grid-filling node's tiles by position, as an
  // art palette plus run-length streams of palette indices and fog. No
  // payload transform is needed, for a different reason than the earlier
  // steps. This is the first change where the reader branches on whether a
  // field is present (`cells`), rather than filling a field from its
  // absence, so the code reads both forms indefinitely. A version-4 save
  // carries no `cells` field and takes the unencoded branch. The save is
  // written in the new form the next time it is saved.
  4: (state) => state,
};

/**
 * A save's stored schema version as a non-negative integer. Absent,
 * non-numeric, non-finite, and negative values all read as 0, the
 * pre-version format. The function is pure.
 * @param {RawSave} parsed
 * @returns {number}
 */
export function stateVersion(parsed) {
  const value = parsed.version;
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

/**
 * Carry a raw parsed save from one schema version to another. The function
 * applies each registered step in ascending order, and it is pure.
 *
 * A step with no entry in the table is a pass-through, not an error. A
 * version increase with no payload change is a valid case, and an error here
 * fails a load, the outcome this table exists to avoid. A unit test asserts
 * that the table covers every version below `CURRENT_VERSION`, so a step
 * registered under the wrong key is caught there.
 *
 * A save newer than this app (`from > to`) runs no steps and comes back
 * unchanged, for the validator that follows to read on a best-effort basis.
 * The function never migrates a save to an older version.
 * @param {RawSave} parsed
 * @param {number} from
 * @param {number} [to]
 * @param {Record<number, MigrationStep>} [table]
 * @returns {RawSave}
 */
export function migrateState(parsed, from, to = CURRENT_VERSION, table = MIGRATIONS) {
  let state = parsed;
  for (let version = from; version < to; version += 1) {
    const step = table[version];
    if (step) state = step(state);
  }
  return state;
}
