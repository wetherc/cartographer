/**
 * Keep the live objects when an adopted campaign says the same thing.
 *
 * A cross-tab save adoption parses the whole campaign and writes the result
 * over `app.state`. Every entity in the new state is a fresh object, even
 * where the field values are identical, so a panel that compares its rows by
 * identity sees every row as new and rebuilds all of them. Most adoptions
 * carry one small edit, because autosave writes after ten idle seconds of
 * editing and a fight writes after each action.
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

const { hasOwnProperty } = Object.prototype;

/**
 * True when a key counts for the walk: an own key whose value is not
 * `undefined`. A key set to `undefined` counts as absent, the same way
 * `StateDiff.equalValues` counts it, so an explicit `undefined` on one side
 * and an absent key on the other is not a difference.
 * @param {Record<string, unknown>} record
 * @param {string} key
 * @returns {boolean}
 */
function isDefined(record, key) {
  return hasOwnProperty.call(record, key) && record[key] !== undefined;
}

/**
 * How many keys of a record count for the walk. The count allocates
 * nothing, because the walk runs once for every tile and every metadata
 * record of a changed node.
 * @param {Record<string, unknown>} record
 * @returns {number}
 */
function definedCount(record) {
  let count = 0;
  for (const key in record) if (isDefined(record, key)) count += 1;
  return count;
}

/**
 * True when both lists hold entities with string ids and the same id sits
 * at every index. A decoded node lists its tiles in grid order, so its tile
 * list almost always pairs this way, and id pairing then picks the same
 * mates with no index.
 * @param {unknown[]} live
 * @param {unknown[]} incoming
 * @returns {boolean}
 */
function idsAligned(live, incoming) {
  if (live.length !== incoming.length) return false;
  for (let i = 0; i < live.length; i += 1) {
    const a = live[i];
    const b = incoming[i];
    if (!isRecord(a) || !isRecord(b) || typeof a.id !== 'string' || a.id !== b.id) return false;
  }
  return true;
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
  // Aligned ids give each element the same mate as the id index, and a
  // repeated id pairs by index under both rules.
  const byId = idsAligned(live, incoming) ? null : idIndex(live);
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
 * Store one value on a record under construction.
 * @param {Record<string, unknown>} out
 * @param {string} key
 * @param {unknown} value
 */
function put(out, key, value) {
  if (key === '__proto__') {
    // A plain assignment to this key sets the prototype instead of storing
    // the value, so the property is defined directly.
    Object.defineProperty(out, key, {
      value,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  } else {
    out[key] = value;
  }
}

/**
 * A new record with the live value of each counted incoming key before
 * `stop`, or of every counted key when `stop` is null. Each of those keys
 * kept its live value, so the copy equals what the walk would have built.
 * @param {Record<string, unknown>} live
 * @param {Record<string, unknown>} incoming
 * @param {string | null} stop
 * @returns {Record<string, unknown>}
 */
function keptBefore(live, incoming, stop) {
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const key in incoming) {
    if (key === stop) break;
    if (isDefined(incoming, key)) put(out, key, live[key]);
  }
  return out;
}

/**
 * The walk builds its result only from the first key that differs, so an
 * unchanged record allocates nothing.
 * @param {Record<string, unknown>} live
 * @param {Record<string, unknown>} incoming
 * @returns {Record<string, unknown>}
 */
function reconcileRecord(live, incoming) {
  /** @type {Record<string, unknown> | null} */
  let out = null;
  let count = 0;
  for (const key in incoming) {
    if (!isDefined(incoming, key)) continue;
    count += 1;
    // An own-property check, not `in`: a save can carry an own `__proto__`
    // key, which `in` would match on every object through the prototype
    // chain.
    const kept = hasOwnProperty.call(live, key)
      ? reconcile(live[key], incoming[key])
      : incoming[key];
    if (!out && kept !== live[key]) out = keptBefore(live, incoming, key);
    if (out) put(out, key, kept);
  }
  if (out) return out;
  // Every counted key kept its live value, and a key only the live side
  // counts still makes the result a new record.
  return count === definedCount(live) ? live : keptBefore(live, incoming, null);
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
