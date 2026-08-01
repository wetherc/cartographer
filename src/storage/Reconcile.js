/**
 * Keep the live objects when an adopted campaign says the same thing.
 *
 * A cross-tab save adoption parses the whole campaign and writes the result
 * over `app.state`. Every entity in the new state is a fresh object, even
 * where the field values are identical, so a panel that compares its rows by
 * identity sees every row as new and rebuilds all of them. Most adoptions
 * carry one edit, or none at all: autosave writes every ten idle seconds
 * whether or not anything moved.
 *
 * `reconcile(live, incoming)` returns the incoming value with the live
 * objects put back wherever the two are structurally equal. An unchanged
 * collection comes back as the identical array, an unchanged entity as the
 * identical object, and a changed entity as a new object whose untouched
 * sub-objects are still the live ones. This lets an identity comparison
 * downstream mean what it looks like it means.
 *
 * The walk decides equality as it builds, instead of calling `equalValues`
 * from `StateDiff.js` first. A separate equality pass walks every subtree
 * twice: once to answer the question and once to build the result.
 *
 * An array of entities pairs by `id`, not by index, so an insertion at the
 * front does not make every later entity look changed. This needs no path
 * table, unlike `StateDiff.ID_KEYED`, because it reads the ids off the
 * elements and falls back to index pairing when they are absent or repeated.
 * A reordered collection therefore comes back as a new array holding the
 * same element objects.
 *
 * The functions are pure. Neither side is mutated.
 */

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The keys that a JSON round trip would keep. A key set to `undefined` counts
 * as absent, the same way `StateDiff.equalValues` counts it, so an explicit
 * `undefined` on one side and an absent key on the other is not a difference.
 * @param {Record<string, unknown>} record
 * @returns {string[]}
 */
function definedKeys(record) {
  return Object.keys(record).filter((key) => record[key] !== undefined);
}

/**
 * Index a list of entities by id, or null when the list is not entities with
 * unique ids.
 * @param {unknown[]} list
 * @returns {Map<unknown, unknown> | null}
 */
function idIndex(list) {
  /** @type {Map<unknown, unknown>} */
  const byId = new Map();
  for (const value of list) {
    if (!isRecord(value) || typeof value.id !== 'string') return null;
    if (byId.has(value.id)) return null;
    byId.set(value.id, value);
  }
  return byId;
}

/**
 * @param {unknown[]} live
 * @param {unknown[]} incoming
 * @returns {unknown[]}
 */
function reconcileList(live, incoming) {
  const byId = idIndex(live);
  let changed = live.length !== incoming.length;
  const out = incoming.map((value, i) => {
    const mate = byId && isRecord(value) ? byId.get(value.id) : live[i];
    const kept = mate === undefined ? value : reconcile(mate, value);
    if (kept !== live[i]) changed = true;
    return kept;
  });
  return changed ? out : live;
}

/**
 * @param {Record<string, unknown>} live
 * @param {Record<string, unknown>} incoming
 * @returns {Record<string, unknown>}
 */
function reconcileRecord(live, incoming) {
  const keys = definedKeys(incoming);
  let changed = keys.length !== definedKeys(live).length;
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const key of keys) {
    const kept = key in live ? reconcile(live[key], incoming[key]) : incoming[key];
    if (kept !== live[key]) changed = true;
    out[key] = kept;
  }
  return changed ? out : live;
}

/**
 * The incoming value, with the live objects kept wherever the two say the
 * same thing. Returns `live` itself when the two are structurally equal.
 * @template T
 * @param {unknown} live
 * @param {T} incoming
 * @returns {T}
 */
export function reconcile(live, incoming) {
  if (live === incoming) return incoming;
  if (Array.isArray(live) && Array.isArray(incoming)) {
    return /** @type {T} */ (/** @type {unknown} */ (reconcileList(live, incoming)));
  }
  if (isRecord(live) && isRecord(incoming)) {
    return /** @type {T} */ (/** @type {unknown} */ (reconcileRecord(live, incoming)));
  }
  return incoming;
}
