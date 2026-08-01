import { inBounds, parseCoords, tileIdAt } from './MapGeometry.js';
import { freezeTile, freezeTiles } from './TileFreeze.js';

/** @typedef {import('../types/map.js').MapNode} MapNode */
/** @typedef {import('../types/map.js').Tile} Tile */

/**
 * The lookup structures for one node. Both structures are positional. Each
 * structure maps an identifier to an index into `node.tiles` and holds no
 * tiles. This lets a mutation that replaces a tile in place reuse the
 * structures without a change.
 *
 * `cellPos` is the grid-coordinate structure. It has one entry per cell of the
 * node's width x height extent. Each entry holds the array position of the
 * tile at that cell, or -1 for an empty cell. This structure turns a per-frame
 * `x,y` string build and hash into two array reads. The value is null when the
 * node extent is unusable or too large, and coordinate lookups then fall back
 * to the id map.
 *
 * `addedById` and `addedCells` hold overrides for tiles appended after the
 * base maps were built. Each override belongs to one node entry only, and no
 * code writes to it after the entry is cached. This lets a node share the base
 * maps with its ancestors without a later append on one branch becoming
 * visible on the other branch.
 * @typedef {Object} TileLayout
 * @property {Map<string, number>} posById
 * @property {Int32Array | null} cellPos
 * @property {Map<string, number> | null} addedById
 * @property {Map<number, number> | null} addedCells
 */

/**
 * Per-node tile layout. The code builds the layout lazily at first lookup and
 * caches it in a WeakMap keyed by the node object. Each tile mutation replaces
 * the node immutably (`{ ...node, tiles }`), so a cached layout never goes
 * stale, because a mutated node is a new key. This turns the flat Tile[] scans
 * (getTile .find, setTile .filter, fog checks) into lookups of constant time.
 *
 * The layout is positional. The three mutation helpers below pass the new node
 * the previous node's maps instead of rebuilding them. This makes the cost of a
 * paint or fog drag proportional to the cells crossed, instead of a full
 * re-index per cell. Removing a tile shifts every later position, so it still
 * rebuilds the layout. Erase is the one authoring action that keeps this
 * higher cost.
 *
 * Rule: never mutate node.tiles in place. Every mutation must go through the
 * pure helpers that return a new node. The code enforces this rule: each
 * helper freezes what it puts into the new node while development freezing is
 * on (see `TileFreeze.js`).
 * @type {WeakMap<MapNode, TileLayout>}
 */
const cache = new WeakMap();

/**
 * Cell count limit for the flat coordinate map. Above this limit the code
 * skips the map, so a node with an extreme extent cannot allocate a very
 * large buffer. A real node stays far below this limit.
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
    if (coords && inBounds(node, coords.x, coords.y)) {
      cellPos[coords.y * node.width + coords.x] = i;
    }
  });
  return { posById, cellPos, addedById: null, addedCells: null };
}

/**
 * The cached layout for a node, or a newly built one.
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
 * The array position of a tile within node.tiles, or undefined if the tile
 * is absent. This lets a mutation helper replace one element of a copied
 * array instead of scanning the array again.
 * @param {MapNode} node
 * @param {string} tileId
 * @returns {number | undefined}
 */
export function tilePosition(node, tileId) {
  const entry = layout(node);
  return entry.addedById?.get(tileId) ?? entry.posById.get(tileId);
}

/**
 * The tile with an id, or undefined if the node has no such tile.
 * @param {MapNode} node
 * @param {string} tileId
 * @returns {Tile | undefined}
 */
export function tileAt(node, tileId) {
  const pos = tilePosition(node, tileId);
  return pos === undefined ? undefined : node.tiles[pos];
}

/**
 * The array position of the tile at a grid coordinate, or undefined if the
 * cell is empty or outside the node extent. This function allocates nothing.
 * The render loop and the fog disc need this, because both visit cells by
 * coordinate and otherwise build an id string for each cell each frame.
 * @param {MapNode} node
 * @param {number} x
 * @param {number} y
 * @returns {number | undefined}
 */
export function cellPosition(node, x, y) {
  if (!inBounds(node, x, y)) return undefined;
  const entry = layout(node);
  if (!entry.cellPos) return tilePosition(node, tileIdAt(x, y));
  const cell = y * node.width + x;
  const added = entry.addedCells?.get(cell);
  if (added !== undefined) return added;
  const pos = entry.cellPos[cell];
  return pos < 0 ? undefined : pos;
}

/**
 * The tile at a grid coordinate, or undefined if the cell is empty or
 * outside the node extent.
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
 * A new node holding a tile list, frozen against in-place mutation. Every
 * cache here depends on no code performing that mutation. Every list built or
 * reordered as a whole passes through this function: a load, a generated map,
 * an erase, a resize, a whole-node fog flip. Each caller hands its list to
 * this function instead of writing `tiles` into a node literal. The new node
 * is deliberately left uncached, because only the three helpers below know
 * where a position moved.
 *
 * The per-cell helpers below freeze only the one tile they receive, not the
 * whole list. This keeps their cost bounded instead of proportional to all
 * tiles. See `freezeTiles`.
 * @param {MapNode} node
 * @param {Tile[]} tiles
 * @returns {MapNode}
 */
export function withNodeTiles(node, tiles) {
  return { ...node, tiles: freezeTiles(tiles) };
}

/**
 * A new node with the tile at one array position replaced. Nothing moves, so
 * the new node shares the previous node's layout without change.
 * @param {MapNode} node
 * @param {number} pos
 * @param {Tile} tile
 * @returns {MapNode}
 */
export function withTileReplaced(node, pos, tile) {
  const tiles = node.tiles.slice();
  tiles[pos] = freezeTile(tile);
  const next = { ...node, tiles };
  const entry = cache.get(node);
  if (entry) cache.set(next, entry);
  return next;
}

/**
 * A new node with several tiles replaced at once, keyed by array position. A
 * fog reveal produces this shape: one party step flips a disc of cells.
 * @param {MapNode} node
 * @param {Map<number, Tile>} changes
 * @returns {MapNode}
 */
export function withTilesReplaced(node, changes) {
  const tiles = node.tiles.slice();
  for (const [pos, tile] of changes) tiles[pos] = freezeTile(tile);
  const next = { ...node, tiles };
  const entry = cache.get(node);
  if (entry) cache.set(next, entry);
  return next;
}

/**
 * A new node with a tile appended. The base maps stay shared, and the code
 * records the appended id in this node's own override maps. Once the
 * overrides grow past about the square root of the tile count, the code
 * leaves the new node uncached. The next lookup then rebuilds a flat layout
 * instead of paying a growing copy cost for each appended tile.
 * @param {MapNode} node
 * @param {Tile} tile
 * @returns {MapNode}
 */
export function withTileAppended(node, tile) {
  const next = { ...node, tiles: [...node.tiles, freezeTile(tile)] };
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
