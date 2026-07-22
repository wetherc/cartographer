import { parseCoords } from './MapCanvas.js';

/** @typedef {import('../types/map.js').MapNode} MapNode */

/**
 * Reveal every tile within `radius` (Euclidean distance, in grid cells) of a
 * center tile, leaving already-revealed tiles and tiles outside the radius
 * untouched. Returns a new node; tiles whose id isn't a grid "x,y" coordinate
 * (and the center itself, if its id doesn't parse) are left as-is.
 * @param {MapNode} node
 * @param {string} centerId
 * @param {number} radius
 * @returns {MapNode}
 */
export function revealAround(node, centerId, radius) {
  const center = parseCoords(centerId);
  if (!center) return node;

  const tiles = node.tiles.map((tile) => {
    if (tile.revealed) return tile;
    const coords = parseCoords(tile.id);
    if (!coords) return tile;
    const dx = coords.x - center.x;
    const dy = coords.y - center.y;
    if (Math.sqrt(dx * dx + dy * dy) > radius) return tile;
    return { ...tile, revealed: true };
  });

  return { ...node, tiles };
}

/**
 * Reset every tile in a node back to unrevealed.
 * @param {MapNode} node
 * @returns {MapNode}
 */
export function hideAll(node) {
  return { ...node, tiles: node.tiles.map((tile) => ({ ...tile, revealed: false })) };
}

/**
 * @param {MapNode} node
 * @returns {number} count of currently-revealed tiles
 */
export function revealedCount(node) {
  return node.tiles.filter((tile) => tile.revealed).length;
}
