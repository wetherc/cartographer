import { parseCoords } from './MapGeometry.js';
import { getTile } from './TileGrid.js';

/** @typedef {import('../types/map.js').MapNode} MapNode */
/** @typedef {import('../types/map.js').Tile} Tile */

/**
 * @typedef {Object} RegionGroup
 * @property {string} childNodeId
 * @property {string[]} tileIds
 * @property {number} minX
 * @property {number} minY
 * @property {number} maxX
 * @property {number} maxY
 */

/**
 * Cached region groups per node, keyed by the node object — safe because every
 * tile mutation replaces the node immutably (the TileIndex contract). Group
 * objects are therefore stable per node, which is what lets the chunk cache
 * below key on them directly.
 * @type {WeakMap<MapNode, RegionGroup[]>}
 */
const groupCache = new WeakMap();

/**
 * Groups a node's tiles into contiguous (4-neighbor) blocks that share the
 * same non-null childNodeId, so a region can be entered from any tile in a
 * multi-tile block instead of a single point. Tiles with no childNodeId, or
 * ids that don't parse as "x,y" grid coordinates, are ignored. Memoized per
 * node; treat the returned array as read-only.
 * @param {MapNode} node
 * @returns {RegionGroup[]}
 */
export function findRegionGroups(node) {
  const cached = groupCache.get(node);
  if (cached) return cached;
  /** @type {Map<string, { tile: import('../types/map.js').Tile, x: number, y: number }>} */
  const byCoord = new Map();
  for (const tile of node.tiles) {
    if (!tile.childNodeId) continue;
    const coords = parseCoords(tile.id);
    if (!coords) continue;
    byCoord.set(`${coords.x},${coords.y}`, { tile, x: coords.x, y: coords.y });
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
    let minX = entry.x,
      maxX = entry.x,
      minY = entry.y,
      maxY = entry.y;

    while (stack.length) {
      const current = stack.pop();
      if (!current) break;
      members.push(current.tile.id);
      minX = Math.min(minX, current.x);
      maxX = Math.max(maxX, current.x);
      minY = Math.min(minY, current.y);
      maxY = Math.max(maxY, current.y);

      const neighbors = [
        [current.x + 1, current.y],
        [current.x - 1, current.y],
        [current.x, current.y + 1],
        [current.x, current.y - 1],
      ];
      for (const [nx, ny] of neighbors) {
        const nKey = `${nx},${ny}`;
        if (visited.has(nKey)) continue;
        const neighbor = byCoord.get(nKey);
        if (!neighbor || neighbor.tile.childNodeId !== childNodeId) continue;
        visited.add(nKey);
        stack.push(neighbor);
      }
    }

    groups.push({ childNodeId, tileIds: members, minX, minY, maxX, maxY });
  }

  groupCache.set(node, groups);
  return groups;
}

/**
 * Whether a group's tiles completely fill its bounding box. Only a filled
 * rectangle can be rendered as one image scaled across the block — an L-shaped
 * or ragged group's bounding box overlaps tiles that aren't part of it, so
 * those fall back to per-tile rendering.
 * @param {RegionGroup} group
 * @returns {boolean}
 */
export function isFilledRect(group) {
  return group.tileIds.length === (group.maxX - group.minX + 1) * (group.maxY - group.minY + 1);
}

/**
 * The image that represents a block of tiles when it's drawn as a single
 * scaled tile. A tile carrying a POI marker wins (that's the entrance art a
 * generated map stamps on its anchor); otherwise the top-left-most tile with
 * an image, so hand-painted blocks pick a stable, predictable variant. Null
 * when no member tile has an image.
 * @param {MapNode} node
 * @param {Pick<RegionGroup, 'tileIds'>} group
 * @returns {string | null}
 */
export function groupImageRef(node, group) {
  // One best-so-far pass rather than map-filter-find-reduce: this runs per chunk
  // per group whenever a group's tiles change, and the intermediate arrays plus
  // one wrapper object per member tile were the bulk of its cost.
  /** @type {string | null} */
  let topLeftRef = null;
  let topLeftX = 0;
  let topLeftY = 0;
  for (const id of group.tileIds) {
    const tile = getTile(node, id);
    if (!tile?.imageRef) continue;
    const coords = parseCoords(id);
    if (!coords) continue;
    // A POI marker is the entrance art a generated map stamps on its anchor, so
    // it wins outright and there is nothing left to compare.
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
 * Cached chunks per group, stamped with the tile list they were computed from.
 * The renderer partitions every group every frame, so this has to hit on a
 * repeat frame, and the stamp is exactly the dependency set: a chunk's contents
 * are its group's geometry plus its member tiles' art, and nothing else — not the
 * node's name, extent, or identity.
 *
 * Keying on the node object instead was imprecise in both directions. It
 * discarded chunks a node swap had not invalidated, since a paint/erase/fog drag
 * replaces the node per cell while leaving its groups memoized against the
 * pre-stroke node, so the (node, group) pair could not repeat once a stroke had
 * started — not even for the groups the stroke never came near. And it held a
 * nested WeakMap per node, leaving one dead outer entry per node object a stroke
 * created. `tiles` is the honest stamp: a tile mutation always replaces that
 * array (the TileIndex contract, enforced by TileFreeze) and nothing else does.
 * One entry per group, so a long stroke accumulates nothing, and a group is only
 * reachable through its own node's group cache, so the two die together.
 *
 * This is precision rather than a speedup, and the numbers are worth recording
 * so it is not mistaken for one. The recompute costs about 0.025 ms per painted
 * cell on a twelve-group 40x40 node, and it never ran per frame — the canvas's
 * node object changes only when a cell is painted, so frames between two cell
 * crossings hit the old key too. A member-identity revalidation that would have
 * held chunks across an unrelated cell's paint was measured and dropped: a
 * filled rectangle's member count equals the sum of its chunks' tiles, so
 * revalidating costs the same tile lookups the rebuild does.
 * @type {WeakMap<RegionGroup, { tiles: Tile[], chunks: GroupImageChunk[] }>}
 */
const chunkCache = new WeakMap();

/**
 * Partition a filled-rectangle region group into blocks of at most 2x2 tiles,
 * each carrying its own representative image — so a 4x4 region entrance reads
 * as four distinct 2x2 landmarks rather than one image stretched 4x, and odd
 * edges fall back to 1-wide strips. Chunks whose tiles are all imageless are
 * omitted (nothing to draw). A ragged (non-rectangular) group returns no
 * chunks: its bounding box would overlap tiles outside the group, so it keeps
 * per-tile rendering. Memoized per group against the node's tile list; treat the
 * result as read-only.
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
        for (let cx = x; cx <= maxX; cx++) tileIds.push(`${cx},${cy}`);
      }
      const imageRef = groupImageRef(node, { tileIds });
      if (imageRef) chunks.push({ imageRef, tileIds, minX: x, minY: y, maxX, maxY });
    }
  }
  return chunks;
}
