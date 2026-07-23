import { parseCoords } from './MapGeometry.js';

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
