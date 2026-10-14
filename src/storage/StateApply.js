/**
 * Apply the ops of a structural diff (`StateDiff.js`) to a campaign state.
 * `applyOps` returns a new state and never changes its input. It copies
 * only the containers on the paths of the ops, so every node and entity
 * that no op touches stays the same object.
 */

import { isRecord } from '../util/isRecord.js';
import { childPattern, idFieldFor, ownValue } from './StateDiff.js';

/** @typedef {import('../types/storage.js').DiffOp} DiffOp */

/**
 * Store a value under an own key. A plain assignment to `__proto__` sets the
 * prototype instead of storing the value, so that key is defined directly.
 * @param {Record<string, unknown>} record
 * @param {string} key
 * @param {unknown} value
 */
function setOwn(record, key, value) {
  if (key !== '__proto__') record[key] = value;
  else
    Object.defineProperty(record, key, {
      value,
      writable: true,
      enumerable: true,
      configurable: true,
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
  const child = list
    ? list[at]
    : ownValue(/** @type {Record<string, unknown>} */ (copy), String(segment));
  if (!isRecord(child) && !Array.isArray(child)) return copy;
  const childAt = childPattern(pattern, segment, Boolean(idField));
  const updated = descend(child, op, index + 1, childAt, context);
  if (list) list[at] = updated;
  else setOwn(/** @type {Record<string, unknown>} */ (copy), String(segment), updated);
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
  else setOwn(record, String(segment), op.t);
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
