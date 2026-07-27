/**
 * Packing an entity for storage: the same "omit what the load path fills back
 * in" trade `packTile` makes for tiles, applied to the entity collections a save
 * carries. Pure, and deliberately ignorant of which entities exist — a caller
 * hands in the entity and its `withDefaults`, nothing more.
 *
 * Nothing here states what a default *is*. It asks the unpacker instead: a field
 * is dropped only after `withDefaults` has been shown to put that exact value
 * back for that exact entity. That matters because several defaults are derived
 * rather than constant — `Encounter.withDefaults` resolves `weapon` and `armor`
 * from the encounter's own level and tier — so a table of per-type defaults would
 * omit a level-7 boss's weapon on the grounds that it matches what a level-1 mob
 * would have been given, and loading would then hand the boss different gear.
 * Validating each omission against the real unpacker makes packing and loading
 * unable to disagree by construction rather than by convention.
 */

/**
 * Whether two JSON-shaped values are structurally identical. Key order is
 * ignored, which is the whole reason this is not a `JSON.stringify` comparison:
 * a `withDefaults` spreads the entity and then names the fields it fills, so
 * deleting a field moves it to the end of the key order without changing the
 * value.
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
 * One entity with every field omitted that its own `withDefaults` restores
 * identically. The comparison target is `withDefaults(entity)` rather than
 * `entity` itself, since that is what a load produces and therefore what the
 * stored form has to round-trip to; a `withDefaults` that changes its input
 * still packs correctly.
 *
 * Greedy and order-dependent: dropping `level` first can leave a derived
 * `weapon` undroppable, or the reverse. That costs compression only, never
 * correctness, so one pass in key order is enough. A field `withDefaults` does
 * not fill can never be dropped, because its absence changes the result — which
 * is why nothing has to enumerate the fields that must survive.
 * @param {any} entity
 * @param {(entity: any) => any} withDefaults
 * @returns {Record<string, any>}
 */
export function packEntity(entity, withDefaults) {
  /** @type {Record<string, any>} */
  const target = withDefaults(entity);
  /** @type {Record<string, any>} */
  let packed = { ...target };
  for (const key of Object.keys(target)) {
    const trial = { ...packed };
    delete trial[key];
    if (sameValue(withDefaults(trial), target)) packed = trial;
  }
  return packed;
}

/**
 * `packEntity` over a collection. Entries that are not records pass through
 * untouched: `deserialize` drops those on the way in, so a save should not
 * contain one, and packing is not the place to start deleting data.
 * @param {any[]} list
 * @param {(entity: any) => any} withDefaults
 * @returns {any[]}
 */
export function packEntities(list, withDefaults) {
  return list.map((entity) =>
    entity !== null && typeof entity === 'object' && !Array.isArray(entity)
      ? packEntity(entity, withDefaults)
      : entity,
  );
}
