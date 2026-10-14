import { NEIGHBORS4, gridCellOf, parseCoords, tileIdAt } from './MapGeometry.js';
import { getTile } from './TileGrid.js';
import { MAX_GRID_CELLS, artStamp, linkStamp } from './TileIndex.js';

/** @typedef {import('../types/map.js').MapNode} MapNode */
/** @typedef {import('../types/map.js').Tile} Tile */

/**
 * @typedef {Object} RegionGroup
 * @property {string} childNodeId
 * @property {string[]} tileIds
 * @property {{ x: number, y: number }[]} cells grid coordinates of `tileIds`, in the same order
 * @property {number} minX
 * @property {number} minY
 * @property {number} maxX
 * @property {number} maxY
 */

/**
 * The groups of each `TileIndex.linkStamp`. The groups read only the tile ids
 * and their `childNodeId` values, and the stamp stands for exactly those. A
 * fog reveal or a paint stroke makes a new node with the same stamp, so the
 * new node finds the groups of the old one. `groupOutline`, `regionSlots`,
 * and `groupImageChunks` key on the group objects, so they keep their cached
 * values too.
 * @type {WeakMap<object, RegionGroup[]>}
 */
const groupCache = new WeakMap();

/**
 * Group a node's tiles into contiguous, 4-neighbor blocks that share the same
 * non-null childNodeId. A player can then enter a region from any tile in a
 * multi-tile block instead of from one single point. Tiles with no
 * childNodeId, or with ids that do not parse as "x,y" grid coordinates, are
 * ignored. The result is cached on the node's `linkStamp`, so two nodes with
 * the same links get the same group objects. Treat the returned array as
 * read only.
 * @param {MapNode} node
 * @returns {RegionGroup[]}
 */
export function findRegionGroups(node) {
  const stamp = linkStamp(node);
  let groups = groupCache.get(stamp);
  if (!groups) {
    groups = computeRegionGroups(node);
    groupCache.set(stamp, groups);
  }
  return groups;
}

/**
 * @param {MapNode} node
 * @returns {RegionGroup[]}
 */
function computeRegionGroups(node) {
  return groupsByCell(node) ?? groupsById(node);
}

/**
 * The groups of a node computed over a flat per-cell link grid, or null when
 * the node needs `groupsById`. The grid is an Int32Array with one entry per
 * cell, which holds the index of the cell's child node id in a list of the
 * distinct ids, or -1. The flood fill then reads and writes array entries
 * where `groupsById` builds and hashes an "x,y" string for each of four
 * neighbors of each cell. On a 200x200 node this costs 0.8 ms where
 * `groupsById` costs 17.5 ms.
 *
 * The result is the same as that of `groupsById`: the same groups in the
 * same order, with the members in the same order. Seeds follow the tile
 * order, and each fill visits the neighbors in NEIGHBORS4 order. The grid
 * cannot express three cases, and a linked tile in any of them sends the
 * whole node to `groupsById`. The first is an id that parseCoords reads but
 * that is not the id of a cell inside the extent, such as "01,2" or a cell
 * past the width. The second is two linked tiles with one id, and the third
 * is an extent past MAX_GRID_CELLS.
 * @param {MapNode} node
 * @returns {RegionGroup[] | null}
 */
function groupsByCell(node) {
  const { width, height, tiles } = node;
  const size = width * height;
  if (!Number.isInteger(size) || size <= 0 || size > MAX_GRID_CELLS) return null;
  const link = new Int32Array(size).fill(-1);
  const posOf = new Int32Array(size);
  /** @type {string[]} */
  const names = [];
  /** @type {Map<string, number>} */
  const nameIndex = new Map();
  /** @type {number[]} */
  const seeds = [];
  for (let i = 0; i < tiles.length; i++) {
    const child = tiles[i].childNodeId;
    if (!child) continue;
    const cell = gridCellOf(tiles[i].id, width, height);
    if (cell < 0) {
      if (parseCoords(tiles[i].id)) return null;
      continue;
    }
    if (link[cell] >= 0) return null;
    let k = nameIndex.get(child);
    if (k === undefined) {
      k = names.length;
      names.push(child);
      nameIndex.set(child, k);
    }
    link[cell] = k;
    posOf[cell] = i;
    seeds.push(cell);
  }

  const seen = new Uint8Array(size);
  const stack = new Int32Array(seeds.length);
  /** @type {RegionGroup[]} */
  const groups = [];
  for (const seed of seeds) {
    if (seen[seed]) continue;
    const k = link[seed];
    seen[seed] = 1;
    let top = 0;
    stack[top++] = seed;
    /** @type {string[]} */
    const tileIds = [];
    /** @type {{ x: number, y: number }[]} */
    const cells = [];
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    while (top > 0) {
      const cell = stack[--top];
      const x = cell % width;
      const y = (cell - x) / width;
      tileIds.push(tiles[posOf[cell]].id);
      cells.push({ x, y });
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      for (const [dx, dy] of NEIGHBORS4) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const next = ny * width + nx;
        if (seen[next] || link[next] !== k) continue;
        seen[next] = 1;
        stack[top++] = next;
      }
    }
    groups.push({ childNodeId: names[k], tileIds, cells, minX, minY, maxX, maxY });
  }
  return groups;
}

/**
 * The groups of a node computed over a map keyed by tile id. This handles
 * every node, and `groupsByCell` hands it the nodes that a cell grid cannot
 * express.
 * @param {MapNode} node
 * @returns {RegionGroup[]}
 */
function groupsById(node) {
  // Keyed by the tile's own id, not by a reformatted coordinate. A group
  // reports its members as `tile.id`. An id that parses but is not written
  // canonically, for example "01,2", is otherwise reported under a
  // key that no lookup can reach. The cost is that such a tile cannot be
  // found as a neighbor, so it forms its own group instead of joining the
  // block beside it.
  /** @type {Map<string, { tile: import('../types/map.js').Tile, x: number, y: number }>} */
  const byCoord = new Map();
  for (const tile of node.tiles) {
    if (!tile.childNodeId) continue;
    const coords = parseCoords(tile.id);
    if (!coords) continue;
    byCoord.set(tile.id, { tile, x: coords.x, y: coords.y });
  }

  const visited = new Set();
  /** @type {RegionGroup[]} */
  const groups = [];

  for (const [key, entry] of byCoord) {
    if (visited.has(key)) continue;

    const childNodeId = /** @type {string} */ (entry.tile.childNodeId);
    const stack = [entry];
    visited.add(key);
    const members = [];
    // The coordinates are already parsed here, so the group carries them
    // beside its ids. The renderer clips a partly-explored region's overlay
    // to its revealed tiles, and re-parsing every member id for that ran
    // once per group per frame. This array is index-aligned with `members`
    // and written only here.
    /** @type {{ x: number, y: number }[]} */
    const cells = [];
    let minX = entry.x,
      maxX = entry.x,
      minY = entry.y,
      maxY = entry.y;

    while (stack.length) {
      const current = /** @type {(typeof stack)[number]} */ (stack.pop());
      members.push(current.tile.id);
      cells.push({ x: current.x, y: current.y });
      minX = Math.min(minX, current.x);
      maxX = Math.max(maxX, current.x);
      minY = Math.min(minY, current.y);
      maxY = Math.max(maxY, current.y);

      for (const [dx, dy] of NEIGHBORS4) {
        const nKey = tileIdAt(current.x + dx, current.y + dy);
        if (visited.has(nKey)) continue;
        const neighbor = byCoord.get(nKey);
        if (!neighbor || neighbor.tile.childNodeId !== childNodeId) continue;
        visited.add(nKey);
        stack.push(neighbor);
      }
    }

    groups.push({ childNodeId, tileIds: members, cells, minX, minY, maxX, maxY });
  }

  return groups;
}

/**
 * Whether a group's tiles completely fill its bounding box. Only a filled
 * rectangle can draw as one image scaled across the block. An L-shaped or
 * ragged group's bounding box overlaps tiles that are not part of it, so
 * those groups fall back to per-tile drawing.
 * @param {RegionGroup} group
 * @returns {boolean}
 */
export function isFilledRect(group) {
  return group.tileIds.length === (group.maxX - group.minX + 1) * (group.maxY - group.minY + 1);
}

/**
 * The image that represents a block of tiles when drawn as a single scaled
 * tile. A tile carrying a POI marker wins, since that is the entrance art a
 * generated map stamps on its anchor. Otherwise the top-left-most tile with
 * an image wins, so a hand-painted block picks a stable, predictable
 * variant. Returns null when no member tile has an image.
 * @param {MapNode} node
 * @param {Pick<RegionGroup, 'tileIds'>} group
 * @returns {string | null}
 */
export function groupImageRef(node, group) {
  // This is one best-so-far pass instead of map-filter-find-reduce. It runs
  // once per chunk per group whenever a group's tiles change. The
  // intermediate arrays plus one wrapper object per member tile were the
  // bulk of the earlier cost.
  /** @type {string | null} */
  let topLeftRef = null;
  let topLeftX = 0;
  let topLeftY = 0;
  for (const id of group.tileIds) {
    const tile = getTile(node, id);
    if (!tile?.imageRef) continue;
    const coords = parseCoords(id);
    if (!coords) continue;
    // A POI marker is the entrance art a generated map stamps on its
    // anchor. It wins outright, with nothing left to compare.
    if (tile.metadata.poiType) return tile.imageRef;
    if (
      topLeftRef === null ||
      coords.y < topLeftY ||
      (coords.y === topLeftY && coords.x < topLeftX)
    ) {
      topLeftRef = tile.imageRef;
      topLeftX = coords.x;
      topLeftY = coords.y;
    }
  }
  return topLeftRef;
}

/**
 * A sub-block of a region group drawn as one scaled image.
 * @typedef {Object} GroupImageChunk
 * @property {string} imageRef
 * @property {string[]} tileIds
 * @property {number} minX
 * @property {number} minY
 * @property {number} maxX
 * @property {number} maxY
 */

/**
 * Cached chunks per group, stamped with what they were computed from. The
 * renderer partitions every group every frame, so this cache has to hit on a
 * repeat frame. A chunk reads its group's geometry and the art of its member
 * tiles (`imageRef` and the point of interest type), and nothing else. The
 * group object is the key, and `TileIndex.artStamp` stands for the art. A fog
 * reveal keeps the art stamp, so a party step keeps every chunk. A paint
 * stroke makes a new art stamp for each cell, so the chunks rebuild on the
 * next frame, at about 0.025 ms per painted cell on a twelve-group 40x40
 * node. The tile list is a second stamp. It matches when a caller copies the
 * node object without a tile change, because the copy gets a new layout and
 * so a new art stamp. There is one entry per group, so a long stroke
 * accumulates nothing. A group is reachable only through the group cache, so
 * the entry is freed with the group.
 * @type {WeakMap<RegionGroup, { art: object, tiles: Tile[], chunks: GroupImageChunk[] }>}
 */
const chunkCache = new WeakMap();

/**
 * Partition a filled-rectangle region group into blocks of at most 2x2
 * tiles, each carrying its own representative image. A 4x4 region entrance
 * then reads as four distinct 2x2 landmarks instead of one image stretched
 * 4 times, and odd edges fall back to 1-wide strips. Chunks whose tiles are
 * all imageless are omitted, since there is nothing to draw. A ragged,
 * non-rectangular group returns no chunks: its bounding box overlaps
 * tiles outside the group, so it keeps per-tile drawing. A group with no
 * point-of-interest marker returns none either. Such a group is a painted
 * territory, not a landmark, and a painted field of grass drawn as a few
 * stretched tiles loses its variants. This is memoized per group against the
 * node's art (see `chunkCache`). Treat the result as read only.
 * @param {MapNode} node
 * @param {RegionGroup} group
 * @returns {GroupImageChunk[]}
 */
export function groupImageChunks(node, group) {
  const art = artStamp(node);
  const cached = chunkCache.get(group);
  if (cached && (cached.art === art || cached.tiles === node.tiles)) return cached.chunks;
  const chunks = computeChunks(node, group);
  chunkCache.set(group, { art, tiles: node.tiles, chunks });
  return chunks;
}

/**
 * @param {MapNode} node
 * @param {RegionGroup} group
 * @returns {GroupImageChunk[]}
 */
function computeChunks(node, group) {
  if (!isFilledRect(group) || !group.tileIds.some((id) => getTile(node, id)?.metadata.poiType)) {
    return [];
  }
  /** @type {GroupImageChunk[]} */
  const chunks = [];
  for (let y = group.minY; y <= group.maxY; y += 2) {
    for (let x = group.minX; x <= group.maxX; x += 2) {
      const maxX = Math.min(x + 1, group.maxX);
      const maxY = Math.min(y + 1, group.maxY);
      const tileIds = [];
      for (let cy = y; cy <= maxY; cy++) {
        for (let cx = x; cx <= maxX; cx++) tileIds.push(tileIdAt(cx, cy));
      }
      const imageRef = groupImageRef(node, { tileIds });
      if (imageRef) chunks.push({ imageRef, tileIds, minX: x, minY: y, maxX, maxY });
    }
  }
  return chunks;
}
