/**
 * Structural diffs between two campaign states. These let the undo history
 * cost the size of an edit, not the size of the campaign.
 *
 * `diffState(before, after)` returns a list of ops. `applyOps(state, ops)`
 * walks one forward. `invertOps(ops)` swaps every op's before and after
 * values, which makes undo and redo the same code over the same log. Every
 * function here is pure, and `applyOps` never mutates its input. Library
 * defaults are deep-frozen and copied into campaign state, so writing in
 * place throws an error, not just causes a surprise.
 *
 * This module works on parsed `CampaignState` values, not on serialized
 * text. A textual diff over JSON is larger, cannot survive a key-order
 * change, and must understand the on-disk packing, especially the tile
 * codec, whose `cells` and `fog` streams a diff must
 * never see. On parsed state, an op that inserts a handout would keep its
 * whole `data:` URL, so the undo log diffs the `HistoryCodec.historyForm`
 * of each state instead, where every payload is an `asset:` key.
 */

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
function idFieldFor(pattern) {
  return Object.prototype.hasOwnProperty.call(ID_KEYED, pattern) ? ID_KEYED[pattern] : undefined;
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
      /** @type {Record<string, unknown>} */ (a)[key],
      /** @type {Record<string, unknown>} */ (b)[key],
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
 * The path pattern of a child reached from a container at `pattern`.
 * @param {string} pattern
 * @param {string | number} segment
 * @param {boolean} keyed whether the container is an id-keyed collection
 * @returns {string}
 */
function childPattern(pattern, segment, keyed) {
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
    const inBefore = before[key] !== undefined;
    const inAfter = after[key] !== undefined;
    const childPath = [...path, key];
    if (inBefore && !inAfter) ops.push({ p: childPath, f: before[key] });
    else if (!inBefore && inAfter) ops.push({ p: childPath, t: after[key] });
    else diffValue(before[key], after[key], childPath, childPattern(pattern, key, false), ops);
  }
}

/**
 * Diff an id-keyed collection. The function pairs elements by id, and
 * records each insertion's and removal's index, so inverting the op
 * restores the element's position instead of appending it. This index keeps
 * the capped travelogue cheap. Once the travelogue is full, every logged
 * event removes the oldest entry and appends a new one. Without the index,
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
 * Apply a list of ops, returning a new state and leaving `state` unchanged.
 *
 * The function groups ops instead of applying them in list order. This lets
 * `invertOps` stay a pure swap, with no reversal step: removals run first,
 * then field changes, then insertions by ascending index, then
 * permutations. Insertion indices are meaningful only once the removals are
 * done, and a permutation is meaningful only once the collection holds its
 * final members.
 *
 * An op whose path no longer resolves is skipped, not thrown as an error. A
 * stored log outlives the state it was written against. A delta key can go
 * missing, and a schema step can move a field. An error on the load path
 * produces a save that cannot start.
 *
 * Each container on an op's path is copied once per call, not once per op.
 * The first op that passes through a container copies it, and later ops
 * write into that copy. A keyed list also keeps a map from id to position,
 * so a lookup does not scan the list. The ops of a regenerated 48x48 node
 * (about 2,700, of which 1,820 remove a tile) apply in 1.1 ms this way,
 * and in 6.5 ms with a copy of the node list and the tile list per op.
 * @template {object} T
 * @param {T} state
 * @param {DiffOp[]} ops
 * @returns {T}
 */
export function applyOps(state, ops) {
  /** @type {DiffOp[]} */
  const removals = [];
  /** @type {DiffOp[]} */
  const changes = [];
  /** @type {DiffOp[]} */
  const insertions = [];
  /** @type {DiffOp[]} */
  const orders = [];
  for (const op of ops) {
    if (!Array.isArray(op?.p) || !op.p.length) continue;
    if (op.k === 'order') orders.push(op);
    else if (!('t' in op)) removals.push(op);
    else if (!('f' in op)) insertions.push(op);
    else changes.push(op);
  }
  // A stable sort by index gives ascending order within each collection.
  // Ops for different collections cannot interfere with each other.
  insertions.sort((a, b) => (a.i ?? 0) - (b.i ?? 0));
  /** @type {ApplyContext} */
  const context = {
    owned: new WeakSet(),
    positions: new WeakMap(),
    stale: new WeakMap(),
    phase: 0,
    removing: new Map(),
  };
  let next = /** @type {Record<string, unknown>} */ (state);
  for (const group of [removals, changes, insertions, orders]) {
    for (const op of group) {
      next = /** @type {Record<string, unknown>} */ (descend(next, op, 0, '', context));
    }
    removePending(context);
    context.phase += 1;
  }
  return /** @type {T} */ (next);
}

/**
 * The containers that one `applyOps` call has already copied, and the id
 * positions of its keyed lists. Only a container in `owned` is written in
 * place, so the input state is never changed.
 *
 * A removal from a keyed list only records the id in `removing`, and the
 * list drops every recorded id in one pass at the end of the removal
 * phase. A splice per removal moves the tail of the list each time, and a
 * regenerate that removes 1,820 tiles from a 2,304-tile node spends most of
 * its apply in those moves. `stale` records the phase (removals, changes,
 * insertions, orders) in which an insertion moved a list's elements. For
 * the rest of that phase the list is searched in order, because a map
 * rebuilt after every insertion costs a full pass each time. The next
 * phase builds the map again once.
 * @typedef {{
 *   owned: WeakSet<object>,
 *   positions: WeakMap<unknown[], Map<unknown, number>>,
 *   stale: WeakMap<unknown[], number>,
 *   phase: number,
 *   removing: Map<unknown[], { idField: string, ids: Set<unknown> }>,
 * }} ApplyContext
 */

/**
 * Drop the recorded removals from each list, the first element of each id
 * only, as a splice does.
 * @param {ApplyContext} context
 */
function removePending(context) {
  for (const [list, { idField, ids }] of context.removing) {
    let kept = 0;
    for (const element of list) {
      const id = isRecord(element) ? element[idField] : undefined;
      if (ids.delete(id)) continue;
      list[kept] = element;
      kept += 1;
    }
    list.length = kept;
    moved(list, context);
  }
  context.removing.clear();
}

/**
 * Record that a splice or a replacement moved the ids of a keyed list.
 * @param {unknown[]} list
 * @param {ApplyContext} context
 */
function moved(list, context) {
  context.positions.delete(list);
  context.stale.set(list, context.phase);
}

/**
 * The container itself when this call already copied it, or a new copy.
 * @param {unknown[] | Record<string, unknown>} node
 * @param {ApplyContext} context
 * @returns {unknown[] | Record<string, unknown>}
 */
function ownCopy(node, context) {
  if (context.owned.has(node)) return node;
  const copy = Array.isArray(node) ? node.slice() : { ...node };
  context.owned.add(copy);
  return copy;
}

/**
 * Walk to the op's parent container, copying each container on the way, so
 * the input state is shared and never written to.
 * @param {unknown} node
 * @param {DiffOp} op
 * @param {number} index
 * @param {string} pattern
 * @param {ApplyContext} context
 * @returns {unknown}
 */
function descend(node, op, index, pattern, context) {
  if (!isRecord(node) && !Array.isArray(node)) return node;
  const segment = op.p[index];
  const idField = Array.isArray(node) ? idFieldFor(pattern) : undefined;
  const copy = ownCopy(node, context);
  if (index === op.p.length - 1) {
    write(copy, segment, idField, childPattern(pattern, segment, Boolean(idField)), op, context);
    return copy;
  }
  const list = idField ? /** @type {unknown[]} */ (copy) : null;
  const at = list ? indexOfId(list, /** @type {string} */ (idField), segment, context) : -1;
  if (list && at === -1) return copy;
  const child = list ? list[at] : /** @type {Record<string, unknown>} */ (copy)[String(segment)];
  if (!isRecord(child) && !Array.isArray(child)) return copy;
  const childAt = childPattern(pattern, segment, Boolean(idField));
  const updated = descend(child, op, index + 1, childAt, context);
  if (list) list[at] = updated;
  else /** @type {Record<string, unknown>} */ (copy)[String(segment)] = updated;
  return copy;
}

/**
 * The position of the first element with this id, or -1. The positions of
 * a list are read once and kept until a splice changes them.
 * @param {unknown[]} list
 * @param {string} idField
 * @param {string | number} id
 * @param {ApplyContext} context
 * @returns {number}
 */
function indexOfId(list, idField, id, context) {
  if (context.stale.get(list) === context.phase) {
    return list.findIndex((element) => isRecord(element) && element[idField] === id);
  }
  let positions = context.positions.get(list);
  if (!positions) {
    positions = new Map();
    for (let i = 0; i < list.length; i += 1) {
      const element = list[i];
      if (isRecord(element) && !positions.has(element[idField])) positions.set(element[idField], i);
    }
    context.positions.set(list, positions);
  }
  return positions.get(id) ?? -1;
}

/**
 * Apply one op to its (already copied) parent container.
 * @param {unknown[] | Record<string, unknown>} container
 * @param {string | number} segment
 * @param {string | undefined} idField the container's id field, when it is an id-keyed collection
 * @param {string} pattern the pattern of the value being written
 * @param {DiffOp} op
 * @param {ApplyContext} context
 */
function write(container, segment, idField, pattern, op, context) {
  if (op.k === 'order') {
    writeOrder(container, segment, pattern, op, context);
    return;
  }
  if (idField && Array.isArray(container)) {
    writeKeyed(container, idField, segment, op, context);
    return;
  }
  if (Array.isArray(container)) return; // A positional array is a leaf. Nothing addresses inside it.
  const record = /** @type {Record<string, unknown>} */ (container);
  if (!('t' in op)) delete record[String(segment)];
  else record[String(segment)] = op.t;
}

/**
 * @param {unknown[]} list
 * @param {string} idField
 * @param {string | number} id
 * @param {DiffOp} op
 * @param {ApplyContext} context
 */
function writeKeyed(list, idField, id, op, context) {
  const at = indexOfId(list, idField, id, context);
  if (!('t' in op)) {
    if (at === -1) return;
    const pending = context.removing.get(list);
    if (pending) pending.ids.add(id);
    else context.removing.set(list, { idField, ids: new Set([id]) });
    return;
  }
  if (at !== -1) {
    list[at] = op.t;
    // A value with another id changes which id sits here.
    if (!isRecord(op.t) || op.t[idField] !== id) moved(list, context);
    return;
  }
  const position = Math.min(op.i ?? list.length, list.length);
  list.splice(position, 0, op.t);
  moved(list, context);
}

/**
 * Reorder an id-keyed collection to the op's target sequence. The function
 * ignores ids the collection does not hold. Elements the sequence does not
 * name keep their relative order at the end. A log written against a
 * slightly different state degrades instead of losing elements.
 * @param {unknown[] | Record<string, unknown>} container
 * @param {string | number} segment
 * @param {string} pattern
 * @param {DiffOp} op
 * @param {ApplyContext} context
 */
function writeOrder(container, segment, pattern, op, context) {
  const idField = idFieldFor(pattern);
  const list = Array.isArray(container)
    ? undefined
    : /** @type {Record<string, unknown>} */ (container)[String(segment)];
  if (!idField || !Array.isArray(list) || !Array.isArray(op.t)) return;
  const byId = new Map();
  for (const element of list) {
    if (isRecord(element) && typeof element[idField] === 'string') {
      byId.set(element[idField], element);
    }
  }
  /** @type {unknown[]} */
  const ordered = [];
  for (const id of op.t) {
    if (byId.has(id)) {
      ordered.push(byId.get(id));
      byId.delete(id);
    }
  }
  for (const element of list) {
    const id = isRecord(element) ? element[idField] : undefined;
    if (typeof id !== 'string' || byId.has(id)) ordered.push(element);
  }
  context.owned.add(ordered);
  /** @type {Record<string, unknown>} */ (container)[String(segment)] = ordered;
}

/**
 * The byte cost of a serialized op list in localStorage (UTF-16 uses two
 * bytes per code unit). This sizes the delta log against the origin quota.
 * The function is pure.
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
