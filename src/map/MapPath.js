import { NEIGHBORS4, parseCoords, tileIdAt } from './MapGeometry.js';
import { tileAtXY } from './TileIndex.js';
import { isBlocked, isDeepWater } from './TileKinds.js';

/** @typedef {import('../types/map.js').MapNode} MapNode */
/** @typedef {import('../types/map.js').Tile} Tile */

/**
 * Whether the party can walk on a tile during a move. A wall, an obstacle
 * (`TileKinds.isBlocked`), or deep water stops a walk. With `revealedOnly`,
 * a fogged tile stops it too, so a player cannot learn from a move whether
 * a way through the fog exists.
 * @param {Tile} tile
 * @param {boolean} revealedOnly
 * @returns {boolean}
 */
export function isPassable(tile, revealedOnly) {
  return !isBlocked(tile) && !isDeepWater(tile) && (!revealedOnly || tile.revealed);
}

/**
 * The tiles of a walk from one tile of a node to another, start and target
 * included, or null when no walk leads there. The walk steps to the four
 * side neighbours only, so it cannot slip between two wall pieces that touch
 * at a corner. Each step goes onto a tile that `isPassable` accepts or onto
 * an empty cell. An empty cell lets the walk through, so a move across a gap
 * in a sparse hand-painted map needs no confirm dialog. With `revealedOnly`,
 * an empty cell stops the walk, because fog gives an empty cell no revealed
 * state and a player walk goes through revealed tiles only.
 *
 * The start tile needs no check, so a party that stands on a wall (for
 * example after the GM paints one under it) can still walk off. The target
 * tile needs the check, so no walk ends on a wall. A tile that links to a
 * sub-map is avoided on the way when another route exists, so a walk past a
 * building does not pass through its door. When the only route crosses a
 * link tile, the walk takes it. A start or target id that is not a tile of
 * the node gives null, and a walk to the start tile itself gives `[start]`.
 * @param {MapNode} node
 * @param {string} fromId
 * @param {string} toId
 * @param {{ revealedOnly?: boolean }} [options]
 * @returns {string[] | null}
 */
export function findPath(node, fromId, toId, options = {}) {
  const revealedOnly = options.revealedOnly ?? false;
  const from = parseCoords(fromId);
  const to = parseCoords(toId);
  if (!from || !to || !tileAtXY(node, from.x, from.y)) return null;
  if (fromId === toId) return [fromId];
  const target = tileAtXY(node, to.x, to.y);
  if (!target || !isPassable(target, revealedOnly)) return null;
  return search(node, from, to, revealedOnly, true) ?? search(node, from, to, revealedOnly, false);
}

/**
 * One breadth-first search for `findPath`. With `avoidLinks`, a tile with a
 * sub-map stops the walk the way a wall does.
 * @param {MapNode} node
 * @param {{ x: number, y: number }} from
 * @param {{ x: number, y: number }} to
 * @param {boolean} revealedOnly
 * @param {boolean} avoidLinks
 * @returns {string[] | null}
 */
function search(node, from, to, revealedOnly, avoidLinks) {
  const { width, height } = node;
  const start = from.y * width + from.x;
  const goal = to.y * width + to.x;
  /** @type {Map<number, number>} each reached cell, keyed to the cell it came from */
  const cameFrom = new Map([[start, -1]]);
  const queue = [start];
  for (let q = 0; q < queue.length; q++) {
    const at = queue[q];
    const ax = at % width;
    const ay = (at - ax) / width;
    for (const [dx, dy] of NEIGHBORS4) {
      const x = ax + dx;
      const y = ay + dy;
      const key = y * width + x;
      if (x < 0 || y < 0 || x >= width || y >= height || cameFrom.has(key)) continue;
      if (key === goal) {
        cameFrom.set(key, at);
        return trace(cameFrom, goal, width);
      }
      const tile = tileAtXY(node, x, y);
      const open = tile
        ? isPassable(tile, revealedOnly) && !(avoidLinks && tile.childNodeId)
        : !revealedOnly;
      if (!open) continue;
      cameFrom.set(key, at);
      queue.push(key);
    }
  }
  return null;
}

/**
 * The tile ids from the start of a search to `goal`.
 * @param {Map<number, number>} cameFrom
 * @param {number} goal
 * @param {number} width
 * @returns {string[]}
 */
function trace(cameFrom, goal, width) {
  /** @type {string[]} */
  const ids = [];
  for (let at = goal; at !== -1; at = /** @type {number} */ (cameFrom.get(at))) {
    ids.unshift(tileIdAt(at % width, Math.floor(at / width)));
  }
  return ids;
}

/**
 * Whether a walk leads from one tile of a node to another. See `findPath`
 * for the rules of a walk.
 * @param {MapNode} node
 * @param {string} fromId
 * @param {string} toId
 * @param {{ revealedOnly?: boolean }} [options]
 * @returns {boolean}
 */
export function hasOpenPath(node, fromId, toId, options = {}) {
  return findPath(node, fromId, toId, options) !== null;
}
