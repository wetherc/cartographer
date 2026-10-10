/**
 * Structural diffs between two campaign states. These let the undo history
 * cost the size of an edit, not the size of the campaign.
 *
 * `diffState(before, after)` returns a list of ops. `applyOps(state, ops)`
 * in `StateApply.js` walks one forward. `invertOps(ops)` swaps every op's
 * before and after values, which makes undo and redo the same code over the
 * same log. Every function here and in `StateApply.js` is pure, and
 * `applyOps` never mutates its input. Library defaults are deep-frozen and
 * copied into campaign state, so writing in place throws an error, not just
 * causes a surprise.
 *
 * This module works on parsed `CampaignState` values, not on serialized
 * text. A textual diff over JSON is larger, cannot survive a key-order
 * change, and must understand the on-disk packing, especially the tile
 * codec, whose `cells` and `fog` streams a diff must
 * never see. On parsed state, an op that inserts a handout would keep its
 * whole `data:` URL, so the undo log diffs the `HistoryCodec.historyForm`
 * of each state instead, where every payload is an `asset:` key.
 */

import { isRecord } from '../util/isRecord.js';

/** @typedef {import('../types/storage.js').CampaignState} CampaignState */
/** @typedef {import('../types/storage.js').DiffOp} DiffOp */

/**
 * The collections a diff pairs by element id, not by array index, and the
 * field that holds that id. Diffing them by position turns one insertion
 * into a rewrite of the whole tail. A tile drawn into a 1,600-tile node
 * then costs the whole node.
 *
 * The code looks up a path by replacing every id segment with `*`, so both
 * directions read the table the same way. This table is the module's only
 * coupling to the schema. Keep that coupling here, not spread through the
 * walker functions.
 *
 * `combat/order` is keyed too, although it is an ordered sequence. Each
 * combat action changes one participant's action budget, and as a leaf the
 * whole order goes into the op twice. In a ten-combatant fight, an attack
 * that spends an action, deals damage, and logs a line costs 3,438
 * characters of history with a leaf order and 481 with a keyed one. A
 * re-sort of the order records as an `order` op over the ids.
 *
 * Every other array is a leaf, compared and replaced whole. This is
 * deliberate. Lookups go through `idFieldFor`, which reads own keys only, so
 * a state key such as `constructor` cannot pick up an Object.prototype
 * member and take the keyed branch. `proficiencies.skills` and an overlay
 * stack are both small. Both are sequences whose elements have no id, and a
 * keyed diff of them has nothing to pair on.
 * @type {Record<string, string>}
 */
export const ID_KEYED = {
  nodes: 'id',
  'nodes/*/tiles': 'id',
  characters: 'id',
  'characters/*/resources': 'id',
  'characters/*/inventory': 'id',
  creatures: 'id',
  quests: 'id',
  handouts: 'id',
  travelog: 'id',
  bestiary: 'id',
  'combat/order': 'id',
};

/**
 * The id field of an id-keyed collection pattern, or undefined for a leaf.
 * @param {string} pattern
 * @returns {string | undefined}
 */
export function idFieldFor(pattern) {
  return Object.prototype.hasOwnProperty.call(ID_KEYED, pattern) ? ID_KEYED[pattern] : undefined;
}

/**
 * Structural equality over the JSON-shaped values a campaign state holds.
 * A key whose value is `undefined` counts as absent, because the log is
 * JSON, and an `undefined` value does not survive being written and read
 * back.
 *
 * `EntityPack` has its own deep compare, built around proving that a
 * `withDefaults` restores an omitted field. Sharing one function couples a
 * packing concern to a diffing concern for a dozen lines, so this
 * function stays local to this module.
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
export function equalValues(a, b) {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((value, i) => equalValues(value, b[i]));
  }
  const aKeys = definedKeys(/** @type {Record<string, unknown>} */ (a));
  const bKeys = definedKeys(/** @type {Record<string, unknown>} */ (b));
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) =>
    equalValues(
      ownValue(/** @type {Record<string, unknown>} */ (a), key),
      ownValue(/** @type {Record<string, unknown>} */ (b), key),
    ),
  );
}

/**
 * @param {Record<string, unknown>} record
 * @returns {string[]}
 */
function definedKeys(record) {
  return Object.keys(record).filter((key) => record[key] !== undefined);
}

/**
 * The value of an own key, or undefined. A parsed save can contain an own
 * `__proto__` key, and a plain read of that key on a record without it
 * returns `Object.prototype`, which would diff as a change.
 * @param {Record<string, unknown>} record
 * @param {string} key
 * @returns {unknown}
 */
export function ownValue(record, key) {
  return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
}

/**
 * The path pattern of a child reached from a container at `pattern`.
 * @param {string} pattern
 * @param {string | number} segment
 * @param {boolean} keyed whether the container is an id-keyed collection
 * @returns {string}
 */
export function childPattern(pattern, segment, keyed) {
  if (keyed) return `${pattern}/*`;
  return pattern ? `${pattern}/${segment}` : String(segment);
}

/**
 * The element ids of an id-keyed collection, or null when the array cannot
 * be paired by id: a missing id, a non-string id, or a duplicate id. In
 * that case the code falls back to a whole-array comparison, which keeps a
 * hand-edited save from being diffed into an op list that cannot be applied.
 * @param {unknown[]} list
 * @param {string} idField
 * @returns {string[] | null}
 */
function elementIds(list, idField) {
  /** @type {string[]} */
  const ids = [];
  const seen = new Set();
  for (const element of list) {
    if (!isRecord(element)) return null;
    const id = element[idField];
    if (typeof id !== 'string' || seen.has(id)) return null;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/**
 * @param {string[]} a
 * @param {string[]} b
 * @returns {boolean}
 */
function sameSequence(a, b) {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

/**
 * The ops that turn `before` into `after`. The function is pure, and the
 * returned list is JSON-safe.
 * @param {CampaignState | Record<string, unknown>} before
 * @param {CampaignState | Record<string, unknown>} after
 * @returns {DiffOp[]}
 */
export function diffState(before, after) {
  /** @type {DiffOp[]} */
  const ops = [];
  diffValue(before, after, [], '', ops);
  return ops;
}

/**
 * @param {unknown} before
 * @param {unknown} after
 * @param {(string | number)[]} path
 * @param {string} pattern
 * @param {DiffOp[]} ops
 */
function diffValue(before, after, path, pattern, ops) {
  // Identical references cannot differ, because no code mutates a handed-out
  // value in place. `HistoryLog.saveCampaign` keeps the live state object as
  // the persisted snapshot, so on every save after the first the two states
  // share every entity the edit did not touch, and this check makes the diff
  // cost the size of the edit instead of the size of the world. A cold diff
  // after a reload shares nothing and still walks everything.
  if (before === after) return;
  const idField = idFieldFor(pattern);
  if (idField && Array.isArray(before) && Array.isArray(after)) {
    diffKeyed(before, after, path, pattern, idField, ops);
    return;
  }
  if (isRecord(before) && isRecord(after)) {
    diffRecord(before, after, path, pattern, ops);
    return;
  }
  if (!equalValues(before, after)) ops.push({ p: path, f: before, t: after });
}

/**
 * @param {Record<string, unknown>} before
 * @param {Record<string, unknown>} after
 * @param {(string | number)[]} path
 * @param {string} pattern
 * @param {DiffOp[]} ops
 */
function diffRecord(before, after, path, pattern, ops) {
  const keys = new Set([...definedKeys(before), ...definedKeys(after)]);
  for (const key of keys) {
    const was = ownValue(before, key);
    const now = ownValue(after, key);
    const childPath = [...path, key];
    if (was !== undefined && now === undefined) ops.push({ p: childPath, f: was });
    else if (was === undefined && now !== undefined) ops.push({ p: childPath, t: now });
    else diffValue(was, now, childPath, childPattern(pattern, key, false), ops);
  }
}

/**
 * Diff an id-keyed collection. The function pairs elements by id, and
 * records each insertion's and removal's index, so inverting the op
 * restores the element's position instead of appending it. This index keeps
 * the capped travelogue cheap. Once the travelogue is full, every logged
 * event removes an older entry and appends a new one. Without the index,
 * the inverse of that pair needs the whole id sequence.
 *
 * The function emits an `order` op only for a genuine permutation of the
 * elements both states share.
 * @param {unknown[]} before
 * @param {unknown[]} after
 * @param {(string | number)[]} path
 * @param {string} pattern
 * @param {string} idField
 * @param {DiffOp[]} ops
 */
function diffKeyed(before, after, path, pattern, idField, ops) {
  const beforeIds = elementIds(before, idField);
  const afterIds = elementIds(after, idField);
  if (!beforeIds || !afterIds) {
    if (!equalValues(before, after)) ops.push({ p: path, f: before, t: after });
    return;
  }
  const beforeById = new Map(beforeIds.map((id, i) => [id, before[i]]));
  const afterById = new Map(afterIds.map((id, i) => [id, after[i]]));
  beforeIds.forEach((id, i) => {
    if (!afterById.has(id)) ops.push({ p: [...path, id], f: before[i], i });
  });
  afterIds.forEach((id, i) => {
    if (!beforeById.has(id)) ops.push({ p: [...path, id], t: after[i], i });
  });
  const elementPattern = childPattern(pattern, '', true);
  for (const id of afterIds) {
    if (!beforeById.has(id)) continue;
    diffValue(beforeById.get(id), afterById.get(id), [...path, id], elementPattern, ops);
  }
  const keptBefore = beforeIds.filter((id) => afterById.has(id));
  const keptAfter = afterIds.filter((id) => beforeById.has(id));
  if (!sameSequence(keptBefore, keptAfter)) {
    ops.push({ k: 'order', p: path, f: beforeIds, t: afterIds });
  }
}

/**
 * The ops that turn `after` back into `before`. This is a swap of each op's
 * two values, with the index and the order marker carried through. `i`
 * means "this element's index in whichever state holds it", the same fact
 * read from either direction. The function is pure, and it is its own
 * inverse.
 * @param {DiffOp[]} ops
 * @returns {DiffOp[]}
 */
export function invertOps(ops) {
  return ops.map((op) => {
    /** @type {DiffOp} */
    const inverted = { p: op.p };
    if ('t' in op) inverted.f = op.t;
    if ('f' in op) inverted.t = op.f;
    if (op.i !== undefined) inverted.i = op.i;
    if (op.k !== undefined) inverted.k = op.k;
    return inverted;
  });
}

/**
 * The byte cost of a serialized op list in localStorage (UTF-16 uses two
 * bytes per code unit). The function is pure. The tests use it to compare a
 * delta log with the full state, and no app code calls it.
 * @param {DiffOp[]} ops
 * @returns {number}
 */
export function opsByteSize(ops) {
  return JSON.stringify(ops).length * 2;
}

/** Thrown inside `jsonLengthWithin` to stop the walk once it passes the limit. */
const OVER = Symbol('over');

/**
 * The length of `JSON.stringify(value)`, or `Infinity` as soon as it is
 * known to pass `limit`. The walk stops at that point, so a caller that
 * only needs to know whether a value fits never builds the string. An op
 * list that replaces a whole world of 300 nodes stringifies to about 21
 * million characters, where a walk that stops at the size of the save
 * reads a small part of it. The function is pure. It covers the values a
 * campaign state holds: records, arrays, strings, finite numbers,
 * booleans, and null.
 * @param {unknown} value
 * @param {number} limit
 * @returns {number}
 */
export function jsonLengthWithin(value, limit) {
  let total = 0;
  /** @param {number} n */
  const add = (n) => {
    total += n;
    if (total > limit) throw OVER;
  };
  /** @param {unknown} item @param {boolean} inArray */
  const walk = (item, inArray) => {
    if (item === undefined || typeof item === 'function' || typeof item === 'symbol') {
      if (inArray) add(4);
      return;
    }
    if (item === null) add(4);
    else if (typeof item === 'string') add(JSON.stringify(item).length);
    else if (typeof item === 'number') add(Number.isFinite(item) ? String(item).length : 4);
    else if (typeof item === 'boolean') add(item ? 4 : 5);
    else if (Array.isArray(item)) {
      add(item.length ? item.length + 1 : 2);
      for (const element of item) walk(element, true);
    } else {
      const record = /** @type {Record<string, unknown>} */ (item);
      const keys = definedKeys(record).filter(
        (key) => typeof record[key] !== 'function' && typeof record[key] !== 'symbol',
      );
      add(keys.length ? keys.length + 1 : 2);
      for (const key of keys) {
        add(JSON.stringify(key).length + 1);
        walk(record[key], false);
      }
    }
  };
  try {
    walk(value, false);
  } catch (error) {
    if (error === OVER) return Infinity;
    throw error;
  }
  return total;
}
