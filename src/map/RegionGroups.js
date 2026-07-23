import { parseCoords } from './MapGeometry.js';
import { getTile } from './TileGrid.js';

/** @typedef {import('../types/map.js').MapNode} MapNode */

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
 * Groups a node's tiles into contiguous (4-neighbor) blocks that share the
 * same non-null childNodeId, so a region can be entered from any tile in a
 * multi-tile block instead of a single point. Tiles with no childNodeId, or
 * ids that don't parse as "x,y" grid coordinates, are ignored.
 * @param {MapNode} node
 * @returns {RegionGroup[]}
 */
export function findRegionGroups(node) {
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
    let minX = entry.x, maxX = entry.x, minY = entry.y, maxY = entry.y;

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
  const tiles = group.tileIds
    .map((id) => {
      const tile = getTile(node, id);
      const coords = parseCoords(id);
      return tile && coords && tile.imageRef ? { tile, ...coords } : null;
    })
    .filter((t) => t !== null);
  if (!tiles.length) return null;
  const marked = tiles.find((t) => t.tile.metadata.poiType);
  if (marked) return marked.tile.imageRef;
  const topLeft = tiles.reduce((a, b) => (b.y < a.y || (b.y === a.y && b.x < a.x) ? b : a));
  return topLeft.tile.imageRef;
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
 * Partition a filled-rectangle region group into blocks of at most 2x2 tiles,
 * each carrying its own representative image — so a 4x4 region entrance reads
 * as four distinct 2x2 landmarks rather than one image stretched 4x, and odd
 * edges fall back to 1-wide strips. Chunks whose tiles are all imageless are
 * omitted (nothing to draw). A ragged (non-rectangular) group returns no
 * chunks: its bounding box would overlap tiles outside the group, so it keeps
 * per-tile rendering.
 * @param {MapNode} node
 * @param {RegionGroup} group
 * @returns {GroupImageChunk[]}
 */
export function groupImageChunks(node, group) {
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
