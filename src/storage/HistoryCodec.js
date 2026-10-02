/**
 * Compact forms for the node ops of an undo record.
 *
 * `diffState` works on parsed state, so an op that inserts or removes a
 * node carries every tile with every default filled in (`overlayRef: null`,
 * `revealed: false`, `metadata: {}`), and a regenerated node becomes one op
 * per changed tile field. Adding one generated 48x48 region costs about
 * 97,000 characters of ops, and regenerating one costs 427,000 to 565,000,
 * while the save grows by about 5,300. The history cap is 262,144
 * characters, so two or three such steps remove every older undo step.
 *
 * `compactOps` rewrites the ops of each node into the smallest of three
 * forms:
 *
 * - the ops as `diffState` wrote them;
 * - one `node` op whose values are whole nodes in the save's own form
 *   (`SaveManager.encodeHistoryNode`: packed tiles, then the tile codec),
 *   which an inserted or a removed node always takes;
 * - one `fog` op, when every op of the node flips a tile's `revealed`
 *   flag. Its `t` lists the ids that the step reveals and its `f` the ids
 *   that it hides again, about 8 characters a tile where a plain op costs
 *   about 70.
 *
 * `invertOps` swaps `f` and `t` of either kind like any other op, and
 * `expandOps` turns both kinds back into plain ops for `applyOps`. The
 * module is pure, apart from the cache of `historyForm`.
 *
 * `historyForm` hoists every image payload of a state to its `asset:` key
 * (`Assets.js`), and the log diffs that form. An op that adds or removes an
 * image then names the key, and the payload stays in the image table.
 * `opsNameAssets` tells `HistoryLog.applyHistoryOps` when an applied step
 * needs its keys resolved again.
 *
 * The encoded node values follow `TileCodec.js` through its public
 * functions only, so a change to the codec changes these records too. A
 * stored log whose records a new codec cannot read is safe, because a log
 * of another schema version is discarded whole.
 */

import { decodeHistoryNode, encodeHistoryNode } from './SaveManager.js';
import { jsonLengthWithin } from './StateDiff.js';
import { ASSET_PREFIX, hoistAssets } from './Assets.js';

/** @typedef {import('../types/storage.js').DiffOp} DiffOp */

/** The op kind whose values are whole nodes in the save's form. */
export const NODE_OP = 'node';

/** The op kind whose values are the tile ids that one step reveals and hides. */
export const FOG_OP = 'fog';

/**
 * @param {unknown} value
 * @returns {value is Record<string, any>}
 */
function isNode(value) {
  return (
    typeof value === 'object' && value !== null && Array.isArray(/** @type {any} */ (value).tiles)
  );
}

/**
 * The node id that an op belongs to, or null when the op is not inside one
 * node: an op on the node list itself, or a node list that is not keyed.
 * @param {DiffOp} op
 * @returns {string | null}
 */
function nodeIdOf(op) {
  return op.p.length >= 2 && op.p[0] === 'nodes' && typeof op.p[1] === 'string' ? op.p[1] : null;
}

/**
 * The fog op for a node's ops, or null when one of the ops does something
 * other than flip a tile's `revealed` flag.
 * @param {string} id
 * @param {DiffOp[]} ops
 * @returns {DiffOp | null}
 */
function fogOp(id, ops) {
  /** @type {string[]} */
  const revealed = [];
  /** @type {string[]} */
  const hidden = [];
  for (const op of ops) {
    const [, , tiles, tileId, field] = op.p;
    const flips = typeof op.f === 'boolean' && typeof op.t === 'boolean' && op.f !== op.t;
    if (op.k || op.p.length !== 5 || tiles !== 'tiles' || field !== 'revealed' || !flips) {
      return null;
    }
    if (typeof tileId !== 'string') return null;
    (op.t ? revealed : hidden).push(tileId);
  }
  return { k: FOG_OP, p: ['nodes', id], f: hidden, t: revealed };
}

/**
 * The node op for a node's ops, or null when a side of the step is not a
 * node with a tile list. An insertion and a removal keep their index.
 * @param {string} id
 * @param {DiffOp[]} ops
 * @param {Map<string, unknown>} beforeById
 * @param {Map<string, unknown>} afterById
 * @returns {DiffOp | null}
 */
function nodeOp(id, ops, beforeById, afterById) {
  const before = beforeById.get(id);
  const after = afterById.get(id);
  if ((before !== undefined && !isNode(before)) || (after !== undefined && !isNode(after))) {
    return null;
  }
  /** @type {DiffOp} */
  const op = { k: NODE_OP, p: ['nodes', id] };
  if (before !== undefined) op.f = encodeHistoryNode(before);
  if (after !== undefined) op.t = encodeHistoryNode(after);
  const whole = ops.find((entry) => entry.p.length === 2 && entry.i !== undefined);
  if (whole) op.i = whole.i;
  return op;
}

/**
 * The nodes of a state by id, or an empty map when the state has no node
 * list.
 * @param {unknown} state
 * @returns {Map<string, unknown>}
 */
function nodesById(state) {
  const nodes = /** @type {any} */ (state)?.nodes;
  /** @type {Map<string, unknown>} */
  const byId = new Map();
  if (!Array.isArray(nodes)) return byId;
  for (const node of nodes) {
    if (node && typeof node === 'object' && typeof node.id === 'string') byId.set(node.id, node);
  }
  return byId;
}

/**
 * The ops of one step with every node's ops in its smallest form, and the
 * length of the whole list as JSON, or null as soon as that length is
 * known to pass `limit`. `before` and `after` are the states that `ops`
 * was diffed from. The node ops are measured against each other with
 * `jsonLengthWithin`, so no list is stringified to be measured. A node op
 * is always used for an inserted or a removed node, because the node in
 * the save's form is smaller than the same node in parsed form.
 * @param {DiffOp[]} ops
 * @param {unknown} before
 * @param {unknown} after
 * @param {number} limit
 * @returns {{ ops: DiffOp[], length: number } | null}
 */
export function compactOps(ops, before, after, limit) {
  /** @type {Map<string, DiffOp[]>} */
  const groups = new Map();
  for (const op of ops) {
    const id = nodeIdOf(op);
    if (id === null) continue;
    const group = groups.get(id);
    if (group) group.push(op);
    else groups.set(id, [op]);
  }
  const beforeById = groups.size ? nodesById(before) : new Map();
  const afterById = groups.size ? nodesById(after) : new Map();
  // '[' plus each op and the ',' or ']' after it.
  let length = 1;
  /** @type {DiffOp[]} */
  const out = [];
  /** @param {DiffOp[]} list @param {number} size */
  const emit = (list, size) => {
    out.push(...list);
    length += size;
  };
  /** @param {DiffOp[]} list @param {number} room */
  const measure = (list, room) => {
    let size = 0;
    for (const op of list) {
      size += jsonLengthWithin(op, room - size) + 1;
      if (size > room) return Infinity;
    }
    return size;
  };
  for (const op of ops) {
    const id = nodeIdOf(op);
    const group = id === null ? [op] : groups.get(id);
    if (!group) continue; // A node group already emitted with its first op.
    const room = limit - length;
    if (id === null) {
      emit(group, measure(group, room));
    } else {
      groups.delete(id);
      const whole = group.some((entry) => entry.p.length === 2 && !('f' in entry && 't' in entry));
      const node = nodeOp(id, group, beforeById, afterById);
      const fog = whole ? null : fogOp(id, group);
      const nodeSize = node ? measure([node], room) : Infinity;
      if (whole && node) {
        emit([node], nodeSize);
      } else {
        const fogSize = fog ? measure([fog], room) : Infinity;
        const rawSize = measure(group, Math.min(room, nodeSize, fogSize));
        const best = Math.min(rawSize, nodeSize, fogSize);
        if (best === rawSize) emit(group, rawSize);
        else if (best === fogSize) emit([/** @type {DiffOp} */ (fog)], fogSize);
        else emit([/** @type {DiffOp} */ (node)], nodeSize);
      }
    }
    if (length > limit) return null;
  }
  return { ops: out, length };
}

/**
 * The plain ops that a list of compact ops stands for, ready for
 * `applyOps`. A `node` op becomes a keyed write of the decoded node. Its
 * `f` stays as it was, because `applyOps` reads only whether `f` exists,
 * to tell a change from an insertion. A `fog` op becomes one `revealed`
 * op per listed tile. Every other op passes through. The function is pure.
 * @param {DiffOp[]} ops
 * @returns {DiffOp[]}
 */
export function expandOps(ops) {
  /** @type {DiffOp[]} */
  const out = [];
  for (const op of ops) {
    if (op?.k === NODE_OP) {
      /** @type {DiffOp} */
      const plain = { p: op.p };
      if ('f' in op) plain.f = op.f;
      if ('t' in op) plain.t = decodeHistoryNode(/** @type {Record<string, any>} */ (op.t));
      if (op.i !== undefined) plain.i = op.i;
      out.push(plain);
    } else if (op?.k === FOG_OP) {
      const tiles = [...op.p, 'tiles'];
      for (const id of listOf(op.t)) out.push({ p: [...tiles, id, 'revealed'], f: false, t: true });
      for (const id of listOf(op.f)) out.push({ p: [...tiles, id, 'revealed'], f: true, t: false });
    } else {
      out.push(op);
    }
  }
  return out;
}

/**
 * The string entries of a fog op's list, or none when the value is not a
 * list. A hand-edited record degrades to a smaller reveal.
 * @param {unknown} value
 * @returns {string[]}
 */
function listOf(value) {
  return Array.isArray(value) ? value.filter((id) => typeof id === 'string') : [];
}

/**
 * The form of each state that `historyForm` built, by state identity. A
 * save diffs the stored state against the new one, and the new one is the
 * stored state of the next save, so each form is built once.
 * @type {WeakMap<object, any>}
 */
const forms = new WeakMap();

/**
 * A state as the undo log diffs it: every inline image payload replaced by
 * its `asset:` key, the same key the save stores, and no `assets` table. An
 * op then names an image by its key, and the payload lives only in the image
 * table. A state with no payload comes back as itself. The function is
 * pure, apart from its cache.
 * @template {object} T
 * @param {T} state
 * @returns {T}
 */
export function historyForm(state) {
  const known = forms.get(state);
  if (known) return known;
  const hoisted = /** @type {Record<string, unknown>} */ (hoistAssets(/** @type {any} */ (state)));
  /** @type {any} */
  let form = state;
  if (hoisted !== /** @type {unknown} */ (state)) {
    form = { ...hoisted };
    delete form.assets;
  }
  forms.set(state, form);
  return form;
}

/**
 * True when an op writes a value that names the image table, so a state
 * with the ops applied needs its `asset:` keys resolved. Only `t` counts,
 * because `applyOps` writes `t` and reads only whether `f` exists.
 * @param {DiffOp[]} ops
 * @returns {boolean}
 */
export function opsNameAssets(ops) {
  return ops.some((op) => namesAsset(op.t));
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function namesAsset(value) {
  if (typeof value === 'string') return value.startsWith(ASSET_PREFIX);
  if (Array.isArray(value)) return value.some(namesAsset);
  if (value && typeof value === 'object') return Object.values(value).some(namesAsset);
  return false;
}
