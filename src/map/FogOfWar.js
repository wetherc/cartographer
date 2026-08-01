import { parseCoords } from './MapGeometry.js';
import {
  cellPosition,
  tileAt,
  tilePosition,
  withNodeTiles,
  withTileReplaced,
  withTilesReplaced,
} from './TileIndex.js';

/** @typedef {import('../types/map.js').MapNode} MapNode */

/**
 * Reveal every tile within `radius` (Euclidean distance in grid cells) of a
 * center tile. The function leaves already-revealed tiles and tiles outside
 * the radius unchanged. The function returns a new node. Tiles whose id is
 * not a grid "x,y" coordinate stay unchanged, including the center tile if
 * its id does not parse.
 * @param {MapNode} node
 * @param {string} centerId
 * @param {number} radius
 * @returns {MapNode}
 */
export function revealAround(node, centerId, radius) {
  const center = parseCoords(centerId);
  if (!center) return node;

  // This code walks the bounding square of the disc by coordinate instead of
  // mapping the whole tile array. This method costs O(radius^2) per party
  // step instead of O(total tiles) and builds no id string per cell. A step
  // that reveals nothing new returns the same node. This keeps the WeakMap
  // caches for tile layout, region groups, and span blocks warm.
  const r = Math.ceil(radius);
  const radiusSq = radius * radius;
  /** @type {Map<number, import('../types/map.js').Tile> | null} */
  let changed = null;
  for (let y = center.y - r; y <= center.y + r; y++) {
    for (let x = center.x - r; x <= center.x + r; x++) {
      const dx = x - center.x;
      const dy = y - center.y;
      if (dx * dx + dy * dy > radiusSq) continue;
      const pos = cellPosition(node, x, y);
      if (pos === undefined) continue;
      const tile = node.tiles[pos];
      if (tile.revealed) continue;
      (changed ??= new Map()).set(pos, { ...tile, revealed: true });
    }
  }
  if (!changed) return node;
  return withTilesReplaced(node, changed);
}

/**
 * Check if a tile sits within a Euclidean radius (in grid cells) of a center
 * tile. The function uses the same distance rule as revealAround. Callers
 * that gate visibility by proximity, for example the map marker detection
 * range, can use this function. The function returns false when either id is
 * not a grid "x,y" coordinate.
 * @param {string} tileId
 * @param {string} centerId
 * @param {number} radius
 * @returns {boolean}
 */
export function withinRadius(tileId, centerId, radius) {
  const tile = parseCoords(tileId);
  const center = parseCoords(centerId);
  if (!tile || !center) return false;
  const dx = tile.x - center.x;
  const dy = tile.y - center.y;
  return Math.sqrt(dx * dx + dy * dy) <= radius;
}

/**
 * Reset every tile in a node back to unrevealed.
 * @param {MapNode} node
 * @returns {MapNode}
 */
export function hideAll(node) {
  return withNodeTiles(
    node,
    node.tiles.map((tile) => ({ ...tile, revealed: false })),
  );
}

/**
 * Reveal every tile in a node. This is the GM action to show the whole area.
 * @param {MapNode} node
 * @returns {MapNode}
 */
export function revealAll(node) {
  return withNodeTiles(
    node,
    node.tiles.map((tile) => ({ ...tile, revealed: true })),
  );
}

/**
 * Set the revealed flag of one tile. This function is the primitive behind
 * the GM fog brush, which strokes reveal or hide across cells the same way
 * the Build paint brush strokes terrain. The function does nothing on an id
 * with no tile, because fog lives on tiles.
 * @param {MapNode} node
 * @param {string} tileId
 * @param {boolean} revealed
 * @returns {MapNode}
 */
export function setTileRevealed(node, tileId, revealed) {
  const existing = tileAt(node, tileId);
  if (!existing || existing.revealed === revealed) return node;
  const pos = /** @type {number} */ (tilePosition(node, tileId));
  return withTileReplaced(node, pos, { ...existing, revealed });
}

/**
 * @param {MapNode} node
 * @returns {number} count of currently-revealed tiles
 */
export function revealedCount(node) {
  return node.tiles.filter((tile) => tile.revealed).length;
}

/**
 * Find the nodes that the party discovered. A discovered node is any node with at
 * least one revealed tile, because the party reveals fog wherever it goes
 * and a visit always leaves a mark. The result also includes the node where
 * the party currently stands, even if that node has no tiles yet, for
 * example the blank starting world. The function keeps the input order.
 * @param {MapNode[]} nodes
 * @param {import('../types/map.js').PartyPosition} party
 * @returns {MapNode[]}
 */
export function discoveredNodes(nodes, party) {
  return nodes.filter(
    (node) => node.id === party.nodeId || node.tiles.some((tile) => tile.revealed),
  );
}
