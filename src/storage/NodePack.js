/**
 * Tile packing for the save string and the undo log. A node on its way into
 * a save has its default-valued tile fields dropped, and then the tile codec
 * (`TileCodec.js`) encodes it by position. `SaveManager.js` runs these steps
 * for every node of a save, and `HistoryCodec.js` runs them for a node that
 * an undo record stores whole.
 */

import { withNodeDefaults } from '../map/NodeDefaults.js';
import { nodeHoldsPayload } from './Assets.js';
import { encodeNodeTiles, decodeNodeTiles } from './TileCodec.js';
import { encodedOf, rememberEncoded } from './EncodedNodes.js';
import { record } from './RecordCoercion.js';

/**
 * A tile with every default-valued field omitted. Default tile boilerplate
 * (`overlayRef: null`, `revealed: false`, `childNodeId: null`, `span: 1`,
 * and an all-default `metadata` block) makes up the bulk of a serialized
 * campaign. It is 62 percent of the example campaign's characters, whose
 * tiles are almost all plain unpainted terrain, and the undo ring multiplies
 * whatever the save costs.
 *
 * The inverse function is `withTileDefaults` (`map/NodeDefaults.js`), which
 * every load path already runs. It fills exactly these fields from absence,
 * so packing needs no second statement of what a default value is. The code
 * copies every field except the default-valued ones, instead of picking the
 * known fields, so a field this function does not know about survives the
 * round trip instead of disappearing without warning.
 *
 * The copy skips fields as it builds and never deletes one. A `delete`
 * moves a V8 object to a hash-table property store, which costs about 224
 * bytes per tile where a plain object with the same fields costs about 20.
 *
 * A packed tile exists only inside the serialized string. Nothing in memory
 * ever holds one, because the renderer reads `tile.metadata` without a
 * presence check.
 * @param {import('../types/map.js').Tile} tile
 * @returns {Record<string, any>}
 */
function packTile(tile) {
  return copyPacked(tile, (key, value) => {
    if (key === 'overlayRef' || key === 'childNodeId') return value == null ? SKIP : value;
    if (key === 'revealed') return value === true ? value : SKIP;
    // An absent span and a span of 1 mean the same one-cell image, per `Tile`.
    if (key === 'span') return typeof value === 'number' && value > 1 ? value : SKIP;
    if (key === 'metadata') return packMetadata(value);
    return value;
  });
}

/**
 * The metadata block of a packed tile, or `SKIP` when it is not a record or
 * every field in it has its default value.
 * @param {unknown} value
 * @returns {unknown}
 */
function packMetadata(value) {
  const source = record(value);
  if (!source) return SKIP;
  const packed = copyPacked(source, (key, field) => {
    if (key === 'poiType') return field == null ? SKIP : field;
    if (key === 'discoverable' || key === 'discovered') return field === true ? field : SKIP;
    if (key === 'notes') return field ? field : SKIP;
    return field;
  });
  return Object.keys(packed).length ? packed : SKIP;
}

/** The answer of a `copyPacked` field function for a field to leave out. */
const SKIP = Symbol('skip');

/**
 * A copy of a tile or its metadata in the source's key order, with each
 * field replaced by what `pack` returns for it, and left out where `pack`
 * returns `SKIP`. An own `__proto__` key, which a parsed save can hold, is
 * defined as a plain field, because an assignment to that key sets the
 * prototype instead.
 * @param {Record<string, any>} source
 * @param {(key: string, value: unknown) => unknown} pack
 * @returns {Record<string, any>}
 */
function copyPacked(source, pack) {
  /** @type {Record<string, any>} */
  const out = {};
  for (const key of Object.keys(source)) {
    const value = pack(key, source[key]);
    if (value === SKIP) continue;
    if (key === '__proto__') {
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
  return out;
}

/**
 * A node with its tiles packed.
 * @param {Record<string, any>} node
 * @returns {Record<string, any>}
 */
function packNode(node) {
  return { ...node, tiles: node.tiles.map(packTile) };
}

/**
 * One live node on its way into a save: its cached encoded form, or the
 * encode of a payload-free node, which goes into that cache
 * (`EncodedNodes.js`), or the packed node of a node that holds an inline
 * payload, which still needs the hoist.
 * @param {Record<string, any>} node a node whose `tiles` is an array
 * @returns {{ encoded: Record<string, any> } | { packed: Record<string, any> }}
 */
export function packForSave(node) {
  const cached = encodedOf(node);
  if (cached) return { encoded: cached };
  const packed = packNode(node);
  if (nodeHoldsPayload(packed)) return { packed };
  const encoded = encodeNodeTiles(packed);
  rememberEncoded(node, encoded);
  return { encoded };
}

/**
 * One node in the form a save stores it: tiles packed, then encoded by
 * `TileCodec.js`. The undo log stores a whole node in this form, and it
 * reads the cache above, so a node that a save already encoded costs one
 * lookup. The node's image refs stay as they are, so a node that still
 * contains an inline payload keeps it.
 * @param {Record<string, any>} node a node whose `tiles` is an array
 * @returns {Record<string, any>}
 */
export function encodeHistoryNode(node) {
  const slot = packForSave(node);
  return 'encoded' in slot ? slot.encoded : encodeNodeTiles(slot.packed);
}

/**
 * The inverse of `encodeHistoryNode`: the tiles decoded, then every tile and
 * node default filled in, the same two steps `deserialize` runs on each
 * node. The function is pure.
 * @param {Record<string, any>} node
 * @returns {Record<string, any>}
 */
export function decodeHistoryNode(node) {
  return withNodeDefaults(/** @type {any} */ (decodeNodeTiles(node)));
}
