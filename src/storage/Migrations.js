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

import { defaultEnemyGear } from '../entities/Creature.js';
import { slugId } from '../entities/Roster.js';

/** @typedef {import('../types/storage.js').RawSave} RawSave */
/** @typedef {import('../types/storage.js').MigrationStep} MigrationStep */

/**
 * The schema version `buildState` stamps on every save it writes. Version 0
 * is every save written before this field existed.
 */
export const CURRENT_VERSION = 6;

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
  // 5 -> 6: version 6 merges `encounters` and `npcs` into one `creatures`
  // list. This is the first step that transforms the payload. An encounter
  // becomes a hostile creature: `statBlock` renames to `stats`, `noticed`
  // renames to `met`, and absent gear takes the level and tier default,
  // because that is what absence meant in older saves. An NPC keeps its
  // shape, with absent gear written as an explicit null. An NPC whose id
  // collides with an encounter id gets a fresh slug, because the merged
  // list has one id namespace. `state.bestiary` templates coerce the same
  // way. `state.combat.order` is left alone on purpose: a stored id is
  // ambiguous between the two old lists, and a stale participant already
  // degrades to an unknown row.
  5: (state) => {
    const records = (/** @type {unknown} */ value) =>
      Array.isArray(value)
        ? value.filter((e) => e !== null && typeof e === 'object' && !Array.isArray(e))
        : [];
    /** @type {(e: Record<string, any>) => { level: number, tier: string }} */
    const leveled = (e) => ({
      level: typeof e.level === 'number' && Number.isFinite(e.level) ? e.level : 1,
      tier: e.tier === 'legend' ? 'legend' : 'mob',
    });
    /** Gear as the merged model stores it: an explicit value survives, null
     * included, and an absent one takes the level and tier default. */
    const stampGear = (/** @type {Record<string, any>} */ e) => {
      const { level, tier } = leveled(e);
      const stamp =
        e.weapon === undefined || e.armor === undefined
          ? defaultEnemyGear(level, /** @type {import('../types/entities.js').EnemyTier} */ (tier))
          : null;
      return {
        weapon: e.weapon === undefined ? stamp?.weapon : e.weapon,
        armor: e.armor === undefined ? stamp?.armor : e.armor,
      };
    };
    const foes = records(state.encounters).map((e) => {
      const { statBlock, noticed, ...rest } = e;
      return {
        ...rest,
        ...leveled(e),
        disposition: 'hostile',
        stats: statBlock ?? {},
        met: noticed === true,
        ...stampGear(e),
      };
    });
    const foeIds = foes.map((e) => (typeof e.id === 'string' ? e.id : ''));
    const takenIds = [...foeIds];
    const folk = records(state.npcs).map((n) => {
      let id = typeof n.id === 'string' ? n.id : '';
      if (foeIds.includes(id)) {
        id = slugId(typeof n.name === 'string' ? n.name : 'npc', takenIds);
      }
      takenIds.push(id);
      return {
        ...n,
        id,
        met: n.met === true,
        weapon: n.weapon ?? null,
        armor: n.armor ?? null,
      };
    });
    const bestiary = records(state.bestiary).map((t) => {
      const { statBlock, ...rest } = t;
      return {
        ...rest,
        ...leveled(t),
        disposition: 'hostile',
        stats: statBlock ?? {},
        ...stampGear(t),
      };
    });
    // A version-5 save never carries a `creatures` list. If a malformed one
    // does, its entries are kept in front of the coerced ones.
    const { encounters: _encounters, npcs: _npcs, ...kept } = state;
    return { ...kept, creatures: [...records(state.creatures), ...foes, ...folk], bestiary };
  },
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
