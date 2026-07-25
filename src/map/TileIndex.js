/** @typedef {import('../types/map.js').MapNode} MapNode */
/** @typedef {import('../types/map.js').Tile} Tile */

/**
 * Per-node tile index: id -> tile and id -> array position, built lazily on
 * first lookup and cached in a WeakMap keyed by the node object. Nodes are
 * replaced immutably on every tile mutation ({ ...node, tiles }), so a cached
 * index can never go stale — a mutated node is a new key. This turns the flat
 * Tile[] scans (getTile .find, setTile .filter, fog checks) into O(1) lookups;
 * a paint drag becomes O(cells) instead of O(cells * tiles).
 *
 * The one contract: never mutate node.tiles in place. Every mutation must go
 * through the pure helpers that return a new node.
 * @type {WeakMap<MapNode, { byId: Map<string, Tile>, posById: Map<string, number> }>}
 */
const cache = new WeakMap();

/**
 * The cached (or freshly built) indexes for a node.
 * @param {MapNode} node
 * @returns {{ byId: Map<string, Tile>, posById: Map<string, number> }}
 */
function indexes(node) {
  let entry = cache.get(node);
  if (!entry) {
    /** @type {Map<string, Tile>} */
    const byId = new Map();
    /** @type {Map<string, number>} */
    const posById = new Map();
    node.tiles.forEach((tile, i) => {
      byId.set(tile.id, tile);
      posById.set(tile.id, i);
    });
    entry = { byId, posById };
    cache.set(node, entry);
  }
  return entry;
}

/**
 * The node's tiles keyed by id, for O(1) lookup. Do not mutate the returned Map.
 * @param {MapNode} node
 * @returns {Map<string, Tile>}
 */
export function tileIndex(node) {
  return indexes(node).byId;
}

/**
 * The array position of a tile within node.tiles, or undefined when absent —
 * lets a mutation helper replace one element of a copied array instead of
 * re-scanning for it.
 * @param {MapNode} node
 * @param {string} tileId
 * @returns {number | undefined}
 */
export function tilePosition(node, tileId) {
  return indexes(node).posById.get(tileId);
}
