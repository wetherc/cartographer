import { NEIGHBORS4, parseCoords } from './MapGeometry.js';
import { tileKind } from './TileKinds.js';
import { memoizeByIdentity } from '../util/memoize.js';
import {
  cellPosition,
  tileAt,
  tileAtXY,
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
 * Reveal the fog around every tile of a walk, as `revealAround` does for
 * each step. A party that crosses a map in one click sees what it passes,
 * and not only the ends of the walk. A walk that reveals nothing new
 * returns the same node.
 * @param {MapNode} node
 * @param {readonly string[]} tileIds the tiles of the walk, in any order
 * @param {number} radius
 * @returns {MapNode}
 */
export function revealAlong(node, tileIds, radius) {
  return tileIds.reduce((at, id) => revealAround(at, id, radius), node);
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
 * A player tab asks on every party step, and a step changes one node, so
 * whether a node has a revealed tile is memoized on the node object. Without
 * the memo, a world of 273 nodes and 31,000 tiles costs 0.56 ms per step.
 * @param {MapNode[]} nodes
 * @param {import('../types/map.js').PartyPosition} party
 * @returns {MapNode[]}
 */
export function discoveredNodes(nodes, party) {
  return nodes.filter((node) => node.id === party.nodeId || hasRevealed(node));
}

/** @type {(node: MapNode) => boolean} */
const hasRevealed = memoizeByIdentity((node) => node.tiles.some((tile) => tile.revealed));

/** The positions of the tiles that link to each child node, by child id. */
const linkPositions = memoizeByIdentity(
  /** @param {MapNode} node */
  (node) => {
    /** @type {Map<string, number[]>} */
    const byChild = new Map();
    node.tiles.forEach((tile, pos) => {
      if (!tile.childNodeId) return;
      const list = byChild.get(tile.childNodeId);
      if (list) list.push(pos);
      else byChild.set(tile.childNodeId, [pos]);
    });
    return byChild;
  },
);

/**
 * The first tile of `node` that links to the child node `childId`, or
 * undefined. The lookup is memoized on the node, so a caller can ask on
 * every party step.
 * @param {MapNode} node
 * @param {string} childId
 * @returns {import('../types/map.js').Tile | undefined}
 */
export function linkTileTo(node, childId) {
  const pos = linkPositions(node).get(childId)?.[0];
  return pos === undefined ? undefined : node.tiles[pos];
}

/**
 * Reveal the tiles of `node` that link to the child node `childId`. A party
 * inside a region has seen that region, so its block on the map above
 * shows through the fog even when the party never walked the map above.
 * A node whose link tiles are already revealed, or that has no link to the
 * child, comes back unchanged.
 * @param {MapNode} node
 * @param {string} childId
 * @returns {MapNode}
 */
export function revealLinksTo(node, childId) {
  /** @type {Map<number, import('../types/map.js').Tile> | null} */
  let changed = null;
  for (const pos of linkPositions(node).get(childId) ?? []) {
    const tile = node.tiles[pos];
    if (!tile.revealed) (changed ??= new Map()).set(pos, { ...tile, revealed: true });
  }
  return changed ? withTilesReplaced(node, changed) : node;
}

/** The tile kinds whose revealed tiles mark the unrevealed tiles beside them. */
const FRONTIER_KINDS = new Set(['floor', 'door', 'stairs-up', 'stairs-down', 'obstacle']);

/** @type {ReadonlySet<string>} */
const NO_FRONTIER = new Set();

/**
 * The ids of the unrevealed tiles of an interior that touch a revealed
 * floor, door, stairs, or furnished tile on a side. The renderer and the
 * mini-map draw them a lighter fog, so the GM sees where the explored part
 * of a castle ends. Every cell of a castle has a tile, and without the mark
 * unexplored floor and solid wall draw the same fog. A cell with no tile
 * never gets the mark, so a dungeon does not show which cells exist. An
 * outdoor map has no frontier. The set is memoized on the node, so it is
 * built once per reveal and not once per frame.
 * @type {(node: MapNode) => ReadonlySet<string>}
 */
export const frontierIds = memoizeByIdentity((node) => {
  if (node.kind !== 'interior') return NO_FRONTIER;
  /** @type {Set<string>} */
  const ids = new Set();
  for (const tile of node.tiles) {
    if (!tile.revealed || !FRONTIER_KINDS.has(tileKind(tile))) continue;
    const at = parseCoords(tile.id);
    if (!at) continue;
    for (const [dx, dy] of NEIGHBORS4) {
      const next = tileAtXY(node, at.x + dx, at.y + dy);
      if (next && !next.revealed) ids.add(next.id);
    }
  }
  return ids;
});
