/**
 * The campaign save's schema version and the step transforms that carry an
 * older save forward to it. Pure, and deliberately separate from
 * `SaveManager.js`: a migration reads a shape the current validator would
 * flatten or drop, so it has to run on the raw parsed object *before* that
 * validator, and keeping the table here stops SaveManager from growing a second
 * concern every time the on-disk shape changes.
 *
 * Every back-compatibility path before this one inferred an older save from
 * field *absence*, which cannot express a semantic change — a field that is
 * present but means something different (packed tiles, hoisted image assets, a
 * weapon's properties replacing its `handling` enum) is indistinguishable from
 * the current shape without a version to compare against.
 */

/** @typedef {import('../types/storage.js').RawSave} RawSave */
/** @typedef {import('../types/storage.js').MigrationStep} MigrationStep */

/**
 * The schema version `buildState` stamps on every save it writes. Version 0 is
 * every save written before the field existed.
 */
export const CURRENT_VERSION = 1;

/**
 * Step transforms keyed by the version being migrated *from*: `MIGRATIONS[n]`
 * takes a version-n raw save and returns a version-n+1 one. Each step sees
 * untrusted data and must defend itself accordingly.
 * @type {Record<number, MigrationStep>}
 */
export const MIGRATIONS = {
  // 0 -> 1: version 1 adds the `version` field and nothing else. `deserialize`
  // stamps it, so a version-0 payload is already a valid version-1 one.
  0: (state) => state,
};

/**
 * A save's stored schema version as a non-negative integer. Absent, non-numeric,
 * non-finite, and negative values all read as 0, the pre-version format. Pure.
 * @param {RawSave} parsed
 * @returns {number}
 */
export function stateVersion(parsed) {
  const value = parsed.version;
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

/**
 * Carry a raw parsed save from one schema version to another by applying each
 * registered step in ascending order. Pure.
 *
 * A step with no entry in the table is a pass-through rather than an error: a
 * version bump with no payload change is legitimate, and throwing here would
 * fail a load, which is the outcome this whole seam exists to avoid. A step
 * registered under the wrong key is caught by the unit test asserting the table
 * covers every version below `CURRENT_VERSION`.
 *
 * A save newer than this app (`from > to`) runs no steps and is returned as-is,
 * to be read best-effort by the validator that follows. Down-migration is not
 * attempted.
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
