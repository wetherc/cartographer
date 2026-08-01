import { NEIGHBORS4, parseCoords, tileIdAt } from './MapGeometry.js';
import { getTile } from './TileGrid.js';
import { memoizeByIdentity } from '../util/memoize.js';

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
 * Group a node's tiles into contiguous, 4-neighbor blocks that share the same
 * non-null childNodeId. A player can then enter a region from any tile in a
 * multi-tile block instead of from one single point. Tiles with no
 * childNodeId, or with ids that do not parse as "x,y" grid coordinates, are
 * ignored. This function is memoized on the node object, which every tile
 * mutation replaces under the TileIndex contract, so group objects stay
 * stable per node. The chunk cache below relies on that stability and keys
 * on the group objects directly. Treat the returned array as read only.
 * @param {MapNode} node
 * @returns {RegionGroup[]}
 */
export const findRegionGroups = memoizeByIdentity(computeRegionGroups);

/**
 * @param {MapNode} node
 * @returns {RegionGroup[]}
 */
function computeRegionGroups(node) {
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
      const current = stack.pop();
      if (!current) break;
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
 * Cached chunks per group, stamped with the tile list they were computed
 * from. The renderer partitions every group every frame, so this cache must
 * hit on a repeat frame. The stamp is exactly the dependency set: a chunk's
 * contents are its group's geometry plus its member tiles' art, and nothing
 * else, not the node's name, extent, or identity.
 *
 * Keying on the node object instead was imprecise in both directions. It
 * discarded chunks that a node swap had not invalidated, because a paint,
 * erase, or fog drag replaces the node once per cell while leaving its
 * groups memoized against the pre-stroke node. The (node, group) pair then
 * did not repeat once a stroke had started, not even for the groups the
 * stroke never came near. It also held a nested WeakMap per node, leaving
 * one dead outer entry per node object a stroke created. `tiles` is the
 * honest stamp: a tile mutation always replaces that array, under the
 * TileIndex contract enforced by TileFreeze, and nothing else does. There
 * is one entry per group, so a long stroke accumulates nothing, and a group
 * is reachable only through its own node's group cache, so the two die together.
 *
 * This change bought precision, not speed, and the numbers below record
 * that so nobody mistakes it for a speedup. The recompute costs about
 * 0.025 ms per painted cell on a twelve-group 40x40 node, and it never ran
 * once per frame, because the canvas's node object changes only when a
 * cell is painted, so frames between two cell crossings hit the old key
 * too. A member-identity revalidation, meant to hold chunks across
 * an unrelated cell's paint, was measured and dropped: a filled rectangle's
 * member count equals the sum of its chunks' tiles, so revalidating costs
 * the same tile lookups the rebuild does.
 * @type {WeakMap<RegionGroup, { tiles: Tile[], chunks: GroupImageChunk[] }>}
 */
const chunkCache = new WeakMap();

/**
 * Partition a filled-rectangle region group into blocks of at most 2x2
 * tiles, each carrying its own representative image. A 4x4 region entrance
 * then reads as four distinct 2x2 landmarks instead of one image stretched
 * 4 times, and odd edges fall back to 1-wide strips. Chunks whose tiles are
 * all imageless are omitted, since there is nothing to draw. A ragged,
 * non-rectangular group returns no chunks: its bounding box overlaps
 * tiles outside the group, so it keeps per-tile drawing. This is memoized
 * per group against the node's tile list. Treat the result as read only.
 * @param {MapNode} node
 * @param {RegionGroup} group
 * @returns {GroupImageChunk[]}
 */
export function groupImageChunks(node, group) {
  const cached = chunkCache.get(group);
  if (cached && cached.tiles === node.tiles) return cached.chunks;
  const chunks = computeChunks(node, group);
  chunkCache.set(group, { tiles: node.tiles, chunks });
  return chunks;
}

/**
 * @param {MapNode} node
 * @param {RegionGroup} group
 * @returns {GroupImageChunk[]}
 */
function computeChunks(node, group) {
  if (!isFilledRect(group)) return [];
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
