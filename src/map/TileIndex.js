import { parseCoords } from './MapGeometry.js';

/** @typedef {import('../types/map.js').MapNode} MapNode */
/** @typedef {import('../types/map.js').Tile} Tile */

/**
 * The lookup structures for one node. Both are purely positional — they map an
 * identifier to an index into `node.tiles` and hold no tiles themselves — which
 * is what lets a mutation that replaces a tile in place reuse them untouched.
 *
 * `cellPos` is the grid-coordinate half: one entry per cell of the node's
 * width x height extent, holding the array position of the tile there or -1 for
 * an empty cell. It is what turns a per-frame `x,y` string build and hash into
 * two array reads. Null on a node whose extent is unusable or implausibly large,
 * where coordinate lookups fall back to the id map.
 *
 * `addedById`/`addedCells` are overrides for tiles appended since the base maps
 * were built. They belong to one node's entry alone and are never written after
 * that entry is cached, so a node can share the base maps with its ancestors
 * without a later append on either branch being visible to the other.
 * @typedef {Object} TileLayout
 * @property {Map<string, number>} posById
 * @property {Int32Array | null} cellPos
 * @property {Map<string, number> | null} addedById
 * @property {Map<number, number> | null} addedCells
 */

/**
 * Per-node tile layout, built lazily on first lookup and cached in a WeakMap
 * keyed by the node object. Nodes are replaced immutably on every tile mutation
 * ({ ...node, tiles }), so a cached layout can never go stale — a mutated node
 * is a new key. This turns the flat Tile[] scans (getTile .find, setTile
 * .filter, fog checks) into O(1) lookups.
 *
 * Because the layout is positional, the three mutation helpers below hand the
 * new node the previous node's maps rather than letting it rebuild them, so a
 * paint or fog drag costs O(cells crossed) across the whole stroke instead of a
 * full re-index per cell. Removing a tile shifts every later position and so
 * still rebuilds; that is the one authoring gesture (erase) that keeps the old
 * cost.
 *
 * The one contract: never mutate node.tiles in place. Every mutation must go
 * through the pure helpers that return a new node.
 * @type {WeakMap<MapNode, TileLayout>}
 */
const cache = new WeakMap();

/**
 * Cell count above which the flat coordinate map is skipped, so a node
 * declaring an absurd extent cannot allocate an arbitrarily large buffer. A
 * real node is orders of magnitude below this.
 */
const MAX_GRID_CELLS = 1_000_000;

/**
 * @param {MapNode} node
 * @returns {TileLayout}
 */
function build(node) {
  /** @type {Map<string, number>} */
  const posById = new Map();
  const cells = node.width * node.height;
  /** @type {Int32Array | null} */
  let cellPos = null;
  if (Number.isFinite(cells) && cells > 0 && cells <= MAX_GRID_CELLS) {
    cellPos = new Int32Array(cells).fill(-1);
  }
  node.tiles.forEach((tile, i) => {
    posById.set(tile.id, i);
    if (!cellPos) return;
    const coords = parseCoords(tile.id);
    if (coords && coords.x < node.width && coords.y < node.height) {
      cellPos[coords.y * node.width + coords.x] = i;
    }
  });
  return { posById, cellPos, addedById: null, addedCells: null };
}

/**
 * The cached (or freshly built) layout for a node.
 * @param {MapNode} node
 * @returns {TileLayout}
 */
function layout(node) {
  let entry = cache.get(node);
  if (!entry) {
    entry = build(node);
    cache.set(node, entry);
  }
  return entry;
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
  const entry = layout(node);
  return entry.addedById?.get(tileId) ?? entry.posById.get(tileId);
}

/**
 * The tile with an id, or undefined when the node has none.
 * @param {MapNode} node
 * @param {string} tileId
 * @returns {Tile | undefined}
 */
export function tileAt(node, tileId) {
  const pos = tilePosition(node, tileId);
  return pos === undefined ? undefined : node.tiles[pos];
}

/**
 * The array position of the tile at a grid coordinate, or undefined when the
 * cell is empty or outside the node's extent. Allocates nothing, which is what
 * the render loop and the fog disc need — both visit cells by coordinate and
 * would otherwise build an id string per cell per frame.
 * @param {MapNode} node
 * @param {number} x
 * @param {number} y
 * @returns {number | undefined}
 */
export function cellPosition(node, x, y) {
  if (x < 0 || y < 0 || x >= node.width || y >= node.height) return undefined;
  const entry = layout(node);
  if (!entry.cellPos) return tilePosition(node, `${x},${y}`);
  const cell = y * node.width + x;
  const added = entry.addedCells?.get(cell);
  if (added !== undefined) return added;
  const pos = entry.cellPos[cell];
  return pos < 0 ? undefined : pos;
}

/**
 * The tile at a grid coordinate, or undefined when the cell is empty or outside
 * the node's extent.
 * @param {MapNode} node
 * @param {number} x
 * @param {number} y
 * @returns {Tile | undefined}
 */
export function tileAtXY(node, x, y) {
  const pos = cellPosition(node, x, y);
  return pos === undefined ? undefined : node.tiles[pos];
}

/**
 * A new node with the tile at one array position replaced. Nothing moves, so
 * the new node shares the previous node's layout outright.
 * @param {MapNode} node
 * @param {number} pos
 * @param {Tile} tile
 * @returns {MapNode}
 */
export function withTileReplaced(node, pos, tile) {
  const tiles = node.tiles.slice();
  tiles[pos] = tile;
  const next = { ...node, tiles };
  const entry = cache.get(node);
  if (entry) cache.set(next, entry);
  return next;
}

/**
 * A new node with several tiles replaced at once, keyed by array position — the
 * shape a fog reveal produces, where one party step flips a disc of cells.
 * @param {MapNode} node
 * @param {Map<number, Tile>} changes
 * @returns {MapNode}
 */
export function withTilesReplaced(node, changes) {
  const tiles = node.tiles.slice();
  for (const [pos, tile] of changes) tiles[pos] = tile;
  const next = { ...node, tiles };
  const entry = cache.get(node);
  if (entry) cache.set(next, entry);
  return next;
}

/**
 * A new node with a tile appended. The base maps are shared and the appended
 * id recorded in this node's own override maps; once those overrides grow past
 * roughly the square root of the tile count the new node is left uncached, so
 * the next lookup rebuilds a flat layout rather than paying a growing copy per
 * appended tile.
 * @param {MapNode} node
 * @param {Tile} tile
 * @returns {MapNode}
 */
export function withTileAppended(node, tile) {
  const next = { ...node, tiles: [...node.tiles, tile] };
  const entry = cache.get(node);
  if (!entry) return next;
  const added = (entry.addedById?.size ?? 0) + 1;
  if (added * added > next.tiles.length) return next;
  const pos = next.tiles.length - 1;
  const addedById = new Map(entry.addedById).set(tile.id, pos);
  /** @type {Map<number, number> | null} */
  let addedCells = null;
  if (entry.cellPos) {
    addedCells = new Map(entry.addedCells);
    const coords = parseCoords(tile.id);
    if (coords && coords.x < next.width && coords.y < next.height) {
      addedCells.set(coords.y * next.width + coords.x, pos);
    }
  }
  cache.set(next, { posById: entry.posById, cellPos: entry.cellPos, addedById, addedCells });
  return next;
}
