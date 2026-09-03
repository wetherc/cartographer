/**
 * Packing an entity for storage. This applies the same trade `packTile` makes
 * for tiles (omit what the load path fills back in) to the entity
 * collections a save carries. The code is pure, and it does not know which
 * entities exist. A caller passes in the entity and its `withDefaults`,
 * nothing more.
 *
 * No table here states what a default value is. The code asks the unpacker
 * instead. It removes a field only after `withDefaults` shows that it puts
 * back that exact value for that exact entity. This matters because several
 * defaults are derived, not constant. `Character.withDefaults` derives the
 * hit dice pool and the spell slots from the character's own class list, so
 * the value that absence restores differs per character. A table of
 * per-type defaults holds one value per field, so it either never removes
 * such a field or removes it against a value the load puts back wrong.
 * Checking each removal against the real unpacker makes packing and loading
 * agree by construction, not by convention.
 */

import { memoizeByIdentity } from '../util/memoize.js';

/**
 * True when two JSON-shaped values are structurally identical. The function
 * ignores key order, so it does not just compare `JSON.stringify` output. A
 * `withDefaults` spreads the entity and then names the fields it fills, so
 * removing a field moves it to the end of the key order without changing
 * its value.
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
export function sameValue(a, b) {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((value, i) => sameValue(value, b[i]));
  }
  const left = /** @type {Record<string, unknown>} */ (a);
  const right = /** @type {Record<string, unknown>} */ (b);
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) return false;
  return keys.every((key) => key in right && sameValue(left[key], right[key]));
}

/**
 * True when the value is a plain record: an object, but not an array and not
 * null. Only records have fields worth trial-deleting.
 * @param {unknown} value
 * @returns {value is Record<string, any>}
 */
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Every field path in the record, parents before their children. A path is
 * the key sequence from the top of the entity down to one field, so
 * `['proficiencies', 'expertise']` names a list nested one level in. Walking
 * parents first lets packing drop a whole record before it spends trials on
 * the fields inside it.
 * @param {Record<string, any>} record
 * @param {string[]} [prefix]
 * @returns {Generator<string[]>}
 */
function* fieldPaths(record, prefix = []) {
  for (const key of Object.keys(record)) {
    const path = [...prefix, key];
    yield path;
    if (isRecord(record[key])) yield* fieldPaths(record[key], path);
  }
}

/**
 * A copy of the record with the field at `path` removed. Every record along
 * the path is copied, so the input is never changed. When the path does not
 * exist, because an earlier removal took its parent, the same record comes
 * back, and the caller reads that identity as "nothing to try".
 * @param {Record<string, any>} record
 * @param {string[]} path
 * @returns {Record<string, any>}
 */
function withoutPath(record, path) {
  const [head, ...rest] = path;
  if (!(head in record)) return record;
  if (rest.length === 0) {
    const copy = { ...record };
    delete copy[head];
    return copy;
  }
  const child = record[head];
  if (!isRecord(child)) return record;
  const next = withoutPath(child, rest);
  return next === child ? record : { ...record, [head]: next };
}

/**
 * One entity with every field removed that its own `withDefaults` restores
 * identically. The comparison target is `withDefaults(entity)`, not `entity`
 * itself, because that is what a load produces. The stored form must round
 * trip to that value. A `withDefaults` that changes its input still packs
 * correctly.
 *
 * Fields inside nested records pack the same way as top-level ones. A
 * character's `proficiencies.expertise`, empty on most characters, is
 * removable exactly when `withDefaults` fills the hole with the same empty
 * list, which the trial checks directly.
 *
 * The function is greedy and order-dependent. Removing `level` first can
 * leave a derived `weapon` field impossible to remove, or the reverse. This
 * costs compression only, never correctness, so one pass in path order is
 * enough. A field `withDefaults` does not fill can never be removed, because
 * its absence changes the result. This is why no list of fields that must
 * survive is needed.
 * @param {any} entity
 * @param {(entity: any) => any} withDefaults
 * @returns {Record<string, any>}
 */
export function packEntity(entity, withDefaults) {
  /** @type {Record<string, any>} */
  const target = withDefaults(entity);
  /** @type {Record<string, any>} */
  let packed = { ...target };
  for (const path of fieldPaths(target)) {
    const trial = withoutPath(packed, path);
    if (trial !== packed && sameValue(withDefaults(trial), target)) packed = trial;
  }
  return packed;
}

/**
 * A packer for one collection, cached on each entity's identity. Entities
 * are immutable values (every writer returns a new object), so an entity
 * object that a previous save already packed packs to the same result. A
 * save packs every entity of every collection, and `packEntity` runs
 * `withDefaults` once per field path of each one. Without this cache that
 * trial loop dominates the save cost of a campaign with hundreds of
 * creatures, on every autosave and every combat flush.
 *
 * Entries that are not records pass through unchanged. `deserialize`
 * removes those on the way in, so a save must not contain one, and this
 * packing step must not start deleting data.
 * @param {(entity: any) => any} withDefaults
 * @returns {(list: any[]) => any[]}
 */
export function createEntityPacker(withDefaults) {
  const pack = memoizeByIdentity((entity) => packEntity(entity, withDefaults));
  return (list) => list.map((entity) => (isRecord(entity) ? pack(entity) : entity));
}

/**
 * `packEntity` applied over a collection, with no cache. This is the
 * one-off form; the save path holds one `createEntityPacker` per
 * collection so repeat saves reuse their results.
 * @param {any[]} list
 * @param {(entity: any) => any} withDefaults
 * @returns {any[]}
 */
export function packEntities(list, withDefaults) {
  return createEntityPacker(withDefaults)(list);
}
