import { NEIGHBORS4, NEIGHBORS8, parseCoords } from './MapGeometry.js';
import { cellPosition, withTilesReplaced } from './TileIndex.js';
import { tileKind } from './TileKinds.js';

/** @typedef {import('../types/map.js').MapNode} MapNode */
/** @typedef {import('../types/map.js').Tile} Tile */

/**
 * The most open tiles in one room reveal. A larger fill is a great hall or
 * an open floor, and the sight disc shows it step by step. The cap also
 * limits how many tiles one step adds to a Player tab patch.
 */
export const ROOM_CELL_LIMIT = 100;

/**
 * Whether a tile bounds a room. A fill stops at walls and doors. Furnishing
 * obstacles, such as a counter row or a table, do not stop it, so they do
 * not split one room into two.
 * @param {Tile} tile
 */
const bounds = (tile) => {
  const kind = tileKind(tile);
  return kind === 'wall' || kind === 'door';
};
/**
 * Flood-fill one room from the cell (x, y). The fill walks 4-connected
 * tiles that are not walls or doors, and it records the walls and doors
 * around them, corners included. It gives up and returns null when the room passes `max`
 * open tiles.
 * @param {MapNode} node
 * @param {number} x
 * @param {number} y
 * @param {number} max
 * @returns {Set<number> | null} the positions of the room and its bounds
 */
function fillRoom(node, x, y, max) {
  /** @type {Set<number>} */
  const seen = new Set();
  const start = /** @type {number} */ (cellPosition(node, x, y));
  if (bounds(node.tiles[start])) return seen;
  seen.add(start);
  const queue = [[x, y]];
  let open = 0;
  while (queue.length) {
    const [cx, cy] = /** @type {number[]} */ (queue.pop());
    if (++open > max) return null;
    for (const [dx, dy] of NEIGHBORS8) {
      const pos = cellPosition(node, cx + dx, cy + dy);
      if (pos === undefined || seen.has(pos)) continue;
      const wall = bounds(node.tiles[pos]);
      // A diagonal step does not enter the room, but a diagonal wall
      // is the corner of it.
      if (!wall && dx !== 0 && dy !== 0) continue;
      seen.add(pos);
      if (!wall) queue.push([cx + dx, cy + dy]);
    }
  }
  return seen;
}

/**
 * Reveal the room around a tile: every tile of the room and the walls and
 * doors around it. A party that stands in a door sees into the rooms on
 * both sides, so the fill starts from each open neighbour of a door tile.
 * A room larger than `maxCells` reveals nothing here, and the caller's
 * sight disc is all that the party sees. A reveal that changes nothing
 * returns the same node, so the caches keyed on the node stay warm.
 * @param {MapNode} node
 * @param {string} tileId
 * @param {{ maxCells?: number, done?: Set<number> }} [options] `done`
 *   collects the positions already filled, so a walk fills each room once
 * @returns {MapNode}
 */
export function revealRoom(node, tileId, options = {}) {
  const at = parseCoords(tileId);
  if (!at) return node;
  const pos = cellPosition(node, at.x, at.y);
  if (pos === undefined) return node;
  const { maxCells = ROOM_CELL_LIMIT, done = new Set() } = options;
  const kind = tileKind(node.tiles[pos]);
  if (kind === 'wall') return node;
  const seeds =
    kind === 'door' ? NEIGHBORS4.map(([dx, dy]) => [at.x + dx, at.y + dy]) : [[at.x, at.y]];
  /** @type {Map<number, Tile> | null} */
  let changed = null;
  for (const [x, y] of seeds) {
    const seed = cellPosition(node, x, y);
    if (seed === undefined || done.has(seed)) continue;
    const room = fillRoom(node, x, y, maxCells);
    if (!room) continue;
    for (const p of room) {
      done.add(p);
      const tile = node.tiles[p];
      if (!tile.revealed) (changed ??= new Map()).set(p, { ...tile, revealed: true });
    }
  }
  return changed ? withTilesReplaced(node, changed) : node;
}
