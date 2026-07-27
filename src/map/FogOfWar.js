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

  // Walk the disc's bounding square by coordinate instead of mapping the whole
  // tile array: O(radius^2) per party step, not O(total tiles), and with no id
  // string built per cell. A step that reveals nothing new returns the same
  // node, keeping the WeakMap caches (tile layout, region groups, span blocks)
  // warm.
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
  return withNodeTiles(
    node,
    node.tiles.map((tile) => ({ ...tile, revealed: false })),
  );
}

/**
 * Reveal every tile in a node — the GM's "show the whole area" action.
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
 * Set one tile's revealed flag — the primitive behind the GM fog brush, which
 * strokes reveal/hide across cells the same way the Build paint brush strokes
 * terrain. No-op on an id with no tile (fog lives on tiles).
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
