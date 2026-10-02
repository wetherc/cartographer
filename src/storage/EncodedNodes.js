/**
 * The encoded form of each live node that holds no inline image payload,
 * keyed on the live node. Nodes are immutable values (every map writer
 * returns a new node), so a node object that a previous save already
 * encoded encodes to the same result. Autosave serializes the whole world
 * on every save, and without this cache the tile pack and the codec
 * dominate that cost at large world sizes.
 *
 * The cache keeps only the encoded node: palette refs and index runs, a few
 * hundred bytes per node. The packed tiles between the live node and its
 * encoded form are garbage once the encode returns. A cache that kept them
 * would keep one packed record per tile for the whole session, about 44 MB
 * at 400 extra regions.
 *
 * A save fills the cache (`SaveManager.packState`), and so does a load:
 * `deserialize` stores the encoded record it decoded each node from. A read
 * of a save string then compares each stored node against the entry of the
 * live node with the same id (`nodeReuser`), and a node whose record is
 * unchanged keeps the live object with no decode.
 *
 * A node with an inline payload is not cached. The asset hoist gives it a
 * fresh object on every save, so it re-encodes every time, which keeps the
 * asset table in step with the refs.
 */

import { ASSET_PREFIX } from './Assets.js';
import { equalValues } from './StateDiff.js';

/** @type {WeakMap<object, Record<string, any>>} */
const encodedNodes = new WeakMap();

/**
 * The cached encoded form of a live node, or undefined.
 * @param {object} node
 * @returns {Record<string, any> | undefined}
 */
export function encodedOf(node) {
  return encodedNodes.get(node);
}

/**
 * Cache the encoded form of a live node.
 * @param {object} node
 * @param {Record<string, any>} form
 */
export function rememberEncoded(node, form) {
  encodedNodes.set(node, form);
}

/**
 * True when a value names an `asset:` key or holds an inline image payload
 * anywhere inside it. The load path resolves an `asset:` key against the
 * image table, so the live node can differ from a fresh decode of the same
 * record. A node with an inline payload stays out of the cache (see above).
 * @param {unknown} value
 * @returns {boolean}
 */
export function namesImageData(value) {
  if (typeof value === 'string') return value.startsWith(ASSET_PREFIX) || value.startsWith('data:');
  if (!value || typeof value !== 'object') return false;
  // The index runs are long lists of numbers, so a number costs one type
  // check here and no call.
  for (const item of Array.isArray(value) ? value : Object.values(value)) {
    if ((typeof item === 'string' || typeof item === 'object') && namesImageData(item)) {
      return true;
    }
  }
  return false;
}

/**
 * Whether each cached form names no image data. A cached form never
 * changes, so each one pays for `namesImageData` once, and every later
 * read of a save string costs a lookup.
 * @type {WeakMap<object, boolean>}
 */
const imageFreeForms = new WeakMap();

/**
 * @param {Record<string, any>} form
 * @returns {boolean}
 */
function imageFree(form) {
  let free = imageFreeForms.get(form);
  if (free === undefined) {
    free = !namesImageData(form);
    imageFreeForms.set(form, free);
  }
  return free;
}

/**
 * A lookup from a stored node record to the live node that it encodes
 * unchanged, or undefined. A live node qualifies when its cached encoded
 * form equals the record and names no image data. Each live node matches
 * at most one record, so a save that repeats an id still decodes the
 * second copy into its own object.
 * @param {readonly Record<string, any>[]} previous the live nodes
 * @returns {(record: Record<string, any>) => Record<string, any> | undefined}
 */
export function nodeReuser(previous) {
  /** @type {Map<unknown, Record<string, any>>} */
  const byId = new Map();
  for (const node of previous) if (encodedNodes.has(node)) byId.set(node.id, node);
  return (record) => {
    const node = byId.get(record.id);
    if (!node) return undefined;
    const form = /** @type {Record<string, any>} */ (encodedNodes.get(node));
    if (!equalValues(form, record) || !imageFree(form)) return undefined;
    byId.delete(record.id);
    return node;
  };
}
