import { gridCellOf, hasCoords, inBounds, parseCoords, tileIdAt } from './MapGeometry.js';
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
 * node's width x height extent. Each entry keeps the array position of the
 * tile at that cell, or -1 for an empty cell. This structure turns a per-frame
 * `x,y` string build and hash into two array reads. An id lookup for a grid id
 * such as "3,4" also reads this structure, after it reads the cell from the
 * characters of the id. The value is null when the node extent is unusable or
 * too large, and coordinate lookups then fall back to the id map.
 *
 * `posById` maps only the ids that `cellPos` cannot answer: an id that is not
 * a canonical in-bounds grid id (such as "loose", "01,2", or a cell past the
 * width), and a grid tile whose cell another tile with a different id took.
 * A grid tile costs no map entry, which saves about 43 bytes per tile. When
 * `cellPos` is null, `posById` maps every tile.
 *
 * `addedById` and `addedCells` hold overrides for tiles appended after the
 * base maps were built. Each override belongs to one node entry only, and no
 * code writes to it after the entry is cached. This lets a node share the base
 * maps with its ancestors without a later append on one branch becoming
 * visible on the other branch.
 *
 * `links`, `art`, and `fog` are stamps: empty objects that stand for one
 * state of some tile fields. Two nodes share a stamp only when every position
 * holds the same tile id and the same values of those fields. `links` covers
 * `childNodeId`, `art` covers `imageRef`, `span`, and `metadata.poiType`, and
 * `fog` covers `revealed`. A cache of a value derived from those fields keys
 * on the stamp instead of the node. A fog reveal or a paint stroke then keeps
 * the region caches, because it makes a new node but keeps the `links` stamp.
 *
 * `explored` is the number of revealed tiles whose id names a grid position,
 * or -1 until the first read counts them. The replace helpers add the change
 * of each replaced tile to it, so the count of the next node after a fog
 * reveal costs the flipped cells and not a scan of every tile. Each layout
 * keeps its own number, so the count of an older node stays its own after a
 * newer node takes a new layout.
 * @typedef {Object} TileLayout
 * @property {Map<string, number>} posById
 * @property {Int32Array | null} cellPos
 * @property {Map<string, number> | null} addedById
 * @property {Map<number, number> | null} addedCells
 * @property {object} links
 * @property {object} art
 * @property {object} fog
 * @property {number} explored
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
 * large buffer. A real node stays far below this limit. The tile codec and
 * the PNG export share this bound, so one number says how large a node can
 * be before the app refuses to lay it out.
 */
export const MAX_GRID_CELLS = 1_000_000;

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
  const { tiles, width, height } = node;
  for (let i = 0; i < tiles.length; i++) {
    const id = tiles[i].id;
    if (!cellPos) {
      posById.set(id, i);
      continue;
    }
    let cell = gridCellOf(id, width, height);
    if (cell >= 0) {
      // A later tile with this id wins, as the lookup of a duplicate id does.
      if (posById.size) posById.delete(id);
    } else {
      posById.set(id, i);
      // A lenient id such as "01,2" still draws at its cell.
      const coords = parseCoords(id);
      if (!coords || !inBounds(node, coords.x, coords.y)) continue;
      cell = coords.y * width + coords.x;
    }
    const prev = cellPos[cell];
    if (prev >= 0 && tiles[prev].id !== id && gridCellOf(tiles[prev].id, width, height) === cell) {
      posById.set(tiles[prev].id, prev);
    }
    cellPos[cell] = i;
  }
  return {
    posById,
    cellPos,
    addedById: null,
    addedCells: null,
    links: {},
    art: {},
    fog: {},
    explored: -1,
  };
}

/**
 * The layout for a node made by replacing some tiles of `node`, or null when
 * a replacement changes a tile id, so that the new node builds its own. The
 * positions stay the same, so the result shares the maps of `entry`. A stamp
 * stays when no replaced tile changes a field it covers, and is new
 * otherwise. The result is `entry` itself when every stamp stays.
 * @param {TileLayout} entry
 * @param {MapNode} node the node before the replacement
 * @param {Iterable<[number, Tile]>} changes
 * @returns {TileLayout | null}
 */
function forward(entry, node, changes) {
  let sameLinks = true;
  let sameArt = true;
  let sameFog = true;
  let explored = entry.explored;
  for (const [pos, tile] of changes) {
    const old = node.tiles[pos];
    if (old.id !== tile.id) return null;
    if (old.childNodeId !== tile.childNodeId) sameLinks = false;
    if (
      old.imageRef !== tile.imageRef ||
      old.span !== tile.span ||
      old.metadata.poiType !== tile.metadata.poiType
    ) {
      sameArt = false;
    }
    if (old.revealed === tile.revealed) continue;
    sameFog = false;
    if (explored >= 0 && hasCoords(tile.id, node.width, node.height)) {
      explored += tile.revealed ? 1 : -1;
    }
  }
  if (sameLinks && sameArt && sameFog) return entry;
  return {
    ...entry,
    links: sameLinks ? entry.links : {},
    art: sameArt ? entry.art : {},
    fog: sameFog ? entry.fog : {},
    explored,
  };
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
 * The stamp of a node's tile ids and `childNodeId` values. The region group
 * cache keys on it, so a node that differs from another only in fog or art
 * finds the groups of the other.
 * @param {MapNode} node
 * @returns {object}
 */
export function linkStamp(node) {
  return layout(node).links;
}

/**
 * The stamp of a node's tile ids, `imageRef` and `span` values, and point of
 * interest types. The group image chunks, the span blocks, and the map
 * description's point of interest list key on it, so a fog reveal keeps them.
 * @param {MapNode} node
 * @returns {object}
 */
export function artStamp(node) {
  return layout(node).art;
}

/**
 * The stamp of a node's tile ids and `revealed` flags. The renderer's
 * revealed-id set keys on it, so a paint stroke keeps the set.
 * @param {MapNode} node
 * @returns {object}
 */
export function fogStamp(node) {
  return layout(node).fog;
}

/**
 * The number of revealed tiles whose id names a grid position. The map
 * description reads this as the explored count on every party step. The
 * first read of a layout counts every tile, and each later fog change adds
 * only the tiles it flips (see `forward`).
 * @param {MapNode} node
 * @returns {number}
 */
export function exploredCount(node) {
  const entry = layout(node);
  if (entry.explored < 0) {
    let count = 0;
    for (const tile of node.tiles) {
      if (tile.revealed && hasCoords(tile.id, node.width, node.height)) count++;
    }
    entry.explored = count;
  }
  return entry.explored;
}

/**
 * The revealed tile ids of a node, as a set that answers `has` only. The
 * answer reads the `revealed` flag of the tile with that id in this node, so
 * the lookup builds nothing when the fog changes. An older node, such as one
 * that undo brings back, answers from its own tiles. This makes the cost of
 * a party step independent of the node size.
 * @typedef {{ has(tileId: string): boolean }} RevealedIds
 */

/**
 * The revealed tile ids of a node (see `RevealedIds`). A canonical grid id
 * reads the cell structure and the tile with no map lookup. Any other id, and
 * a node with appended tiles, goes through `tilePosition`.
 * @param {MapNode} node
 * @returns {RevealedIds}
 */
export function revealedIds(node) {
  const entry = layout(node);
  const { cellPos, addedById } = entry;
  const { tiles, width, height } = node;
  return {
    has(tileId) {
      if (cellPos && !addedById) {
        const cell = gridCellOf(tileId, width, height);
        const pos = cell < 0 ? -1 : cellPos[cell];
        if (pos >= 0 && tiles[pos].id === tileId) return tiles[pos].revealed;
      }
      const pos = positionIn(entry, node, tileId);
      return pos !== undefined && tiles[pos].revealed;
    },
  };
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
  return positionIn(layout(node), node, tileId);
}

/**
 * The array position of a tile, read through a layout of the node.
 * @param {TileLayout} entry
 * @param {MapNode} node
 * @param {string} tileId
 * @returns {number | undefined}
 */
function positionIn(entry, node, tileId) {
  const pos = entry.addedById?.get(tileId) ?? entry.posById.get(tileId);
  if (pos !== undefined || !entry.cellPos) return pos;
  const cell = gridCellOf(tileId, node.width, node.height);
  if (cell < 0) return undefined;
  // An appended tile never takes an occupied cell (see withTileAppended), so
  // the base cell is enough here.
  const at = entry.cellPos[cell];
  return at >= 0 && node.tiles[at].id === tileId ? at : undefined;
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
 * the new node shares the previous node's maps (see `forward`).
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
  const carried = entry && forward(entry, node, [[pos, tile]]);
  if (carried) cache.set(next, carried);
  return next;
}

/**
 * A new node with several tiles replaced at once, keyed by array position. A
 * fog reveal produces this pattern: one party step flips a disc of cells.
 * @param {MapNode} node
 * @param {Map<number, Tile>} changes
 * @returns {MapNode}
 */
export function withTilesReplaced(node, changes) {
  const tiles = node.tiles.slice();
  for (const [pos, tile] of changes) tiles[pos] = freezeTile(tile);
  const next = { ...node, tiles };
  const entry = cache.get(node);
  const carried = entry && forward(entry, node, changes);
  if (carried) cache.set(next, carried);
  return next;
}

/**
 * A new node with a tile appended. The base maps stay shared, and the code
 * records the appended id in this node's own override maps. Once the
 * overrides grow past about the square root of the tile count, the code
 * leaves the new node uncached. The next lookup then rebuilds a flat layout
 * instead of paying a growing copy cost for each appended tile. An append onto
 * a cell that a tile already takes also leaves the new node uncached. The `links`
 * stamp stays when the new tile links to no child, because a tile with no
 * link joins no region group, and the `fog` stamp stays when the new tile is
 * not revealed. The `art` stamp is always new.
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
      const cell = coords.y * next.width + coords.x;
      // An append onto a taken cell would hide the tile there from an id
      // lookup, which reads the base cell. A rebuild resolves the overlap.
      if (addedCells.has(cell) || entry.cellPos[cell] >= 0) return next;
      addedCells.set(cell, pos);
    }
  }
  cache.set(next, {
    posById: entry.posById,
    cellPos: entry.cellPos,
    addedById,
    addedCells,
    links: tile.childNodeId ? {} : entry.links,
    art: {},
    fog: tile.revealed ? {} : entry.fog,
    explored:
      entry.explored >= 0 && tile.revealed && hasCoords(tile.id, next.width, next.height)
        ? entry.explored + 1
        : entry.explored,
  });
  return next;
}
