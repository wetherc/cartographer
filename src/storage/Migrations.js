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
import { coerceWeapon } from '../entities/EquipmentPresets.js';
import { slugId } from '../entities/Roster.js';

/** @typedef {import('../types/storage.js').RawSave} RawSave */
/** @typedef {import('../types/storage.js').MigrationStep} MigrationStep */

/**
 * The schema version `buildState` stamps on every save it writes. Version 0
 * is every save written before this field existed.
 */
export const CURRENT_VERSION = 7;

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
  // shape, with absent gear written as an explicit null. The merged list
  // shares one id namespace, and `findCombatant` checks the party roster
  // first, so a creature keeping a character's id would never resolve. A
  // foe or NPC whose id collides with a character or with an earlier
  // creature gets a fresh slug. `state.bestiary` templates coerce the same
  // way. Ids stored elsewhere in the save (`state.combat.order`, a
  // condition source's `casterId`) are left alone on purpose: a stored id
  // is ambiguous between the old lists, and in the old resolution order it
  // already named the entity that keeps the id here. A stale participant
  // degrades to an unknown row, and a stale caster reference only stops
  // the sweep that ends that spell's chips early.
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
    const takenIds = records(state.characters).map((c) => (typeof c.id === 'string' ? c.id : ''));
    /** The entry's id, reslugged when a character or an earlier creature
     * already holds it. Every kept id joins the taken list. */
    const claimId = (/** @type {Record<string, any>} */ entry, /** @type {string} */ fallback) => {
      let id = typeof entry.id === 'string' ? entry.id : '';
      if (takenIds.includes(id)) {
        id = slugId(typeof entry.name === 'string' ? entry.name : fallback, takenIds);
      }
      takenIds.push(id);
      return id;
    };
    const foes = records(state.encounters).map((e) => {
      const { statBlock, noticed, ...rest } = e;
      return {
        ...rest,
        id: claimId(e, 'foe'),
        ...leveled(e),
        disposition: 'hostile',
        stats: statBlock ?? {},
        met: noticed === true,
        ...stampGear(e),
      };
    });
    const folk = records(state.npcs).map((n) => ({
      ...n,
      id: claimId(n, 'npc'),
      met: n.met === true,
      weapon: n.weapon ?? null,
      armor: n.armor ?? null,
    }));
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
  // 6 -> 7: version 7 replaces a weapon's `handling` enum with the property
  // model: `kind`, `category`, `properties`, `range`, and `versatileDamage`.
  // This is the semantic change the module comment above names. The coercer
  // matches each weapon against the built-in presets by name and adopts the
  // preset's property fields, keeping the save's own damage dice, because a
  // GM can edit them. An unmatched weapon maps from its `handling` and gets
  // the 'simple' category. Every class is proficient with simple weapons, so
  // the old always-proficient rolls stay unchanged. The step rewrites the
  // weapons in character inventories, on creatures, and on bestiary
  // templates. The library rewrites its own entries at load, because library
  // files carry no version.
  // The step rewrites only the values that are weapons. Everything
  // malformed passes through untouched, so the validator after the chain
  // still sees it and reports it.
  6: (state) => {
    const usable = (/** @type {unknown} */ value) =>
      value !== null && typeof value === 'object' && !Array.isArray(value);
    /** @type {(item: unknown) => unknown} */
    const recastItem = (item) => {
      if (!usable(item)) return item;
      const record = /** @type {Record<string, any>} */ (item);
      if (record.type !== 'weapon' && record.type !== 'bow') return item;
      const { handling: _handling, ...rest } = record;
      return { ...rest, ...coerceWeapon(record) };
    };
    /** @type {(e: unknown) => unknown} */
    const recastCreature = (e) => {
      if (!usable(e)) return e;
      const record = /** @type {Record<string, any>} */ (e);
      if (!usable(record.weapon)) return e;
      const { handling: _handling, ...rest } = record.weapon;
      return { ...record, weapon: { ...rest, ...coerceWeapon(record.weapon) } };
    };
    /** @type {(c: unknown) => unknown} */
    const recastCharacter = (c) => {
      if (!usable(c)) return c;
      const record = /** @type {Record<string, any>} */ (c);
      if (!Array.isArray(record.inventory)) return c;
      return { ...record, inventory: record.inventory.map(recastItem) };
    };
    return {
      ...state,
      ...(Array.isArray(state.characters)
        ? { characters: state.characters.map(recastCharacter) }
        : {}),
      ...(Array.isArray(state.creatures) ? { creatures: state.creatures.map(recastCreature) } : {}),
      ...(Array.isArray(state.bestiary) ? { bestiary: state.bestiary.map(recastCreature) } : {}),
    };
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
