/**
 * The tiles that a group of spawned creatures spreads over: the chosen tile
 * first, then the nearest open tiles around it.
 */

import { getTile } from './TileGrid.js';
import { isPassable } from './MapPath.js';

/** @typedef {import('../types/map.js').MapNode} MapNode */

/**
 * `count` tile ids for a group placed at `tileId`. The first entry is
 * `tileId` itself, whatever it holds, because the GM chose it. The rest come
 * from a breadth-first walk over the four side neighbours, in order of
 * distance, and take only painted tiles that `isPassable` accepts, so no
 * copy lands in a wall, in deep water, or on an empty cell. The walk passes
 * only through such tiles, so a copy does not end up on the far side of a
 * wall. When the open area runs out, the remaining copies share `tileId`.
 * @param {MapNode} node
 * @param {string} tileId
 * @param {number} count
 * @returns {string[]}
 */
export function spreadTiles(node, tileId, count) {
  const tiles = [tileId];
  const seen = new Set([tileId]);
  const queue = [tileId];
  while (queue.length > 0 && tiles.length < count) {
    const [x, y] = /** @type {string} */ (queue.shift()).split(',').map(Number);
    for (const [dx, dy] of [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ]) {
      const [nx, ny] = [x + dx, y + dy];
      const id = `${nx},${ny}`;
      if (seen.has(id) || nx < 0 || ny < 0 || nx >= node.width || ny >= node.height) continue;
      seen.add(id);
      const tile = getTile(node, id);
      if (!tile || !isPassable(tile, false)) continue;
      queue.push(id);
      if (tiles.length < count) tiles.push(id);
    }
  }
  while (tiles.length < count) tiles.push(tileId);
  return tiles;
}
