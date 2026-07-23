import { parseCoords } from './MapGeometry.js';

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
 * Whether a tile sits within a Euclidean radius (in grid cells) of a center
 * tile — the same distance rule revealAround uses, exposed for callers that
 * gate visibility by proximity (the map's marker detection range). False when
 * either id isn't a grid "x,y" coordinate.
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
  return { ...node, tiles: node.tiles.map((tile) => ({ ...tile, revealed: false })) };
}

/**
 * Reveal every tile in a node — the GM's "show the whole area" action.
 * @param {MapNode} node
 * @returns {MapNode}
 */
export function revealAll(node) {
  return { ...node, tiles: node.tiles.map((tile) => ({ ...tile, revealed: true })) };
}

/**
 * Set one tile's revealed flag — the primitive behind the GM fog brush, which
 * strokes reveal/hide across cells the same way the Build paint brush strokes
 * terrain. No-op on an id with no tile (fog lives on tiles).
 * @param {MapNode} node
 * @param {string} tileId
 * @param {boolean} revealed
 * @returns {MapNode}
 */
export function setTileRevealed(node, tileId, revealed) {
  if (!node.tiles.some((t) => t.id === tileId && t.revealed !== revealed)) return node;
  return {
    ...node,
    tiles: node.tiles.map((t) => (t.id === tileId ? { ...t, revealed } : t)),
  };
}

/**
 * @param {MapNode} node
 * @returns {number} count of currently-revealed tiles
 */
export function revealedCount(node) {
  return node.tiles.filter((tile) => tile.revealed).length;
}

/**
 * The nodes the party has discovered: any node with at least one revealed tile
 * (the party reveals fog wherever it goes, so a visit always leaves a mark),
 * plus the node the party currently stands in even if it has no tiles yet
 * (e.g. the blank starting world). Preserves input order.
 * @param {MapNode[]} nodes
 * @param {import('../types/map.js').PartyPosition} party
 * @returns {MapNode[]}
 */
export function discoveredNodes(nodes, party) {
  return nodes.filter(
    (node) => node.id === party.nodeId || node.tiles.some((tile) => tile.revealed),
  );
}
