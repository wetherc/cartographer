import { ARMS } from './Autotile.js';

/** @typedef {import('./Autotile.js').Arm} Arm */
/** @typedef {import('./Autotile.js').ArmNetwork} ArmNetwork */

/**
 * Road routing for the generators. A road is the cheapest path between two
 * places over the terrain, found with A* search. Each terrain type has a
 * cost, so roads keep to open ground, skirt forests and hills, and never
 * enter water or mountain. A road that meets an existing road follows it,
 * because road cells are cheap, so the network forms junctions instead of
 * parallel tracks.
 *
 * A road crosses a river only as a bridge. The river art has one bridge per
 * axis: `bridge-h` carries an east-west road over a north-south channel, and
 * `bridge-v` carries the reverse. So the search enters a river cell only
 * across a straight channel, and leaves it in the same direction.
 */

/**
 * Cost to step onto one cell of each terrain type. A type that is not
 * listed cannot hold a road.
 * @type {Record<string, number>}
 */
export const ROAD_COST = {
  grass: 1,
  farmland: 1,
  desert: 1.6,
  snow: 2,
  forest: 2.2,
  hills: 3,
  swamp: 4,
};

/** Cost of one step along a road that already exists. */
const ON_ROAD = 0.35;

/** Extra cost of a bridge, so a road crosses a river only when it needs to. */
const BRIDGE = 4;

/**
 * @typedef {{
 *   size: number,
 *   cells: string[],
 *   rivers: ArmNetwork,
 *   roads: ArmNetwork,
 *   blocked?: (x: number, y: number) => boolean,
 *   turn?: number,
 * }} RoadGround
 * `cells` is the terrain class per cell. `blocked` marks cells a road
 * cannot pass through, such as marker tiles. A goal cell is never blocked.
 * `turn` is an extra cost for each change of direction. It defaults to 0.
 * A town street uses it, so that a street on open grass runs straight with
 * few bends, where the cheapest path alone can zigzag.
 */

/**
 * The river axis a road may cross at (x, y): 'v' for a north-south channel,
 * 'h' for an east-west one, null for a cell with no river, or false for a
 * river cell that no bridge fits, such as a bend or a junction.
 * @param {ArmNetwork} rivers @param {number} x @param {number} y
 * @returns {'v' | 'h' | null | false}
 */
function riverAxis(rivers, x, y) {
  if (!rivers.has(x, y)) return null;
  const arms = rivers.at(x, y);
  if (arms.size === 2 && arms.has('n') && arms.has('s')) return 'v';
  if (arms.size === 2 && arms.has('e') && arms.has('w')) return 'h';
  return false;
}

/**
 * The bridge piece for a road over the river at (x, y), or null for a cell
 * with no river under the road.
 * @param {ArmNetwork} rivers @param {number} x @param {number} y
 * @returns {'bridge-h' | 'bridge-v' | null}
 */
export function bridgeAt(rivers, x, y) {
  const axis = riverAxis(rivers, x, y);
  if (axis === 'v') return 'bridge-h';
  if (axis === 'h') return 'bridge-v';
  return null;
}

/**
 * The cost for a road to step onto (x, y) while it moves in direction `d`,
 * an index in ARMS, or Infinity where the road cannot step. A road enters a
 * river cell only across a straight channel, and never ends on one.
 * @param {RoadGround} ground
 * @param {number} x @param {number} y @param {number} d
 * @param {boolean} goal whether (x, y) is where the road ends
 */
function stepCost(ground, x, y, d, goal) {
  const { size, cells, rivers, roads } = ground;
  const axis = riverAxis(rivers, x, y);
  if (axis === false) return Infinity;
  if (axis) {
    // Across the channel only: an east-west move over a north-south river.
    const vertical = d === 0 || d === 2;
    if (goal || vertical === (axis === 'v')) return Infinity;
  }
  const base = roads.has(x, y) ? ON_ROAD : (ROAD_COST[cells[y * size + x]] ?? Infinity);
  return axis && !roads.has(x, y) ? base + BRIDGE : base;
}

/**
 * Split the cells where a road can end into areas. Two cells share an area
 * when a road can run from one to the other, over bridges where it needs
 * them. A river cell is in no area, because a road only crosses it. The
 * search ignores `blocked`, so a marker does not split an area.
 * @param {RoadGround} ground
 * @returns {Int32Array} the area of each cell, indexed `y * size + x`, or
 *   -1 for a cell where no road can end
 */
export function roadAreas(ground) {
  const { size, rivers } = ground;
  /** @param {number} x @param {number} y */
  const inside = (x, y) => x >= 0 && y >= 0 && x < size && y < size;
  /** @param {number} x @param {number} y */
  const land = (x, y) => !rivers.has(x, y) && stepCost(ground, x, y, 0, true) < Infinity;
  const area = new Int32Array(size * size).fill(-1);
  let count = 0;
  for (let i = 0; i < area.length; i++) {
    if (area[i] !== -1 || !land(i % size, Math.floor(i / size))) continue;
    area[i] = count;
    const queue = [i];
    for (let q = 0; q < queue.length; q++) {
      const x = queue[q] % size;
      const y = Math.floor(queue[q] / size);
      for (let d = 0; d < 4; d++) {
        const [, dx, dy] = ARMS[d];
        let nx = x + dx;
        let ny = y + dy;
        // A bridge takes the road straight on to the cell past the river.
        while (
          inside(nx, ny) &&
          rivers.has(nx, ny) &&
          stepCost(ground, nx, ny, d, false) < Infinity
        ) {
          nx += dx;
          ny += dy;
        }
        if (!inside(nx, ny) || !land(nx, ny) || area[ny * size + nx] !== -1) continue;
        area[ny * size + nx] = count;
        queue.push(ny * size + nx);
      }
    }
    count++;
  }
  return area;
}

/**
 * A small binary min-heap of `[priority, value]` pairs.
 * @template T
 */
class Heap {
  constructor() {
    /** @type {[number, T][]} */
    this.items = [];
  }

  /** @param {number} priority @param {T} value */
  push(priority, value) {
    const items = this.items;
    items.push([priority, value]);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (items[parent][0] <= items[i][0]) break;
      [items[parent], items[i]] = [items[i], items[parent]];
      i = parent;
    }
  }

  /** @returns {T} the value with the lowest priority */
  pop() {
    const items = this.items;
    const top = items[0];
    const last = /** @type {[number, T]} */ (items.pop());
    if (items.length) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < items.length && items[l][0] < items[m][0]) m = l;
        if (r < items.length && items[r][0] < items[m][0]) m = r;
        if (m === i) break;
        [items[m], items[i]] = [items[i], items[m]];
        i = m;
      }
    }
    return top[1];
  }

  get size() {
    return this.items.length;
  }
}

/**
 * Find the cheapest road from `start` to any cell where `isGoal` holds.
 * `estimate` gives a lower bound on the steps left from a cell, which keeps
 * the search aimed at the goal. The search state is a cell plus the
 * direction the road entered it, because a road on a bridge must leave in
 * the direction it came from. `heading` is the index in ARMS of the
 * direction the road already moves at `start`. With a `turn` cost, the road
 * then pays for a bend at its first step too, so a street that starts on the
 * map edge heads straight into the map.
 * @param {RoadGround} ground
 * @param {[number, number]} start
 * @param {(x: number, y: number) => boolean} isGoal
 * @param {(x: number, y: number) => number} estimate
 * @param {number} [heading] 0 to 3, or 4 for no heading
 * @returns {[number, number][] | null} the cells from start to goal, or null
 *   when no road can reach a goal
 */
export function routeRoad(ground, start, isGoal, estimate, heading = 4) {
  const { size, rivers, blocked = () => false, turn = 0 } = ground;
  const states = size * size * 5;
  const best = new Float64Array(states).fill(Infinity);
  const from = new Int32Array(states).fill(-1);
  // State index: cell * 5 + entry direction, with 4 meaning "no direction".
  const startState = (start[1] * size + start[0]) * 5 + heading;
  best[startState] = 0;
  /** @type {Heap<number>} */
  const open = new Heap();
  open.push(0, startState);
  while (open.size) {
    const state = open.pop();
    const cell = Math.floor(state / 5);
    const entry = state % 5;
    const x = cell % size;
    const y = Math.floor(cell / size);
    if (state !== startState && isGoal(x, y)) return unwind(state);
    const onBridge = entry < 4 && riverAxis(rivers, x, y) !== null;
    for (let d = 0; d < 4; d++) {
      if (onBridge && d !== entry) continue;
      const [, dx, dy] = ARMS[d];
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      const goal = isGoal(nx, ny);
      if (!goal && blocked(nx, ny)) continue;
      const bend = entry < 4 && d !== entry ? turn : 0;
      const step = stepCost(ground, nx, ny, d, goal) + bend;
      if (step === Infinity) continue;
      const next = (ny * size + nx) * 5 + d;
      const cost = best[state] + step;
      if (cost >= best[next]) continue;
      best[next] = cost;
      from[next] = state;
      open.push(cost + estimate(nx, ny) * ON_ROAD, next);
    }
  }
  return null;

  /** @param {number} state @returns {[number, number][]} */
  function unwind(state) {
    /** @type {[number, number][]} */
    const path = [];
    for (let s = state; s !== -1; s = from[s]) {
      const cell = Math.floor(s / 5);
      path.push([cell % size, Math.floor(cell / size)]);
    }
    return path.reverse();
  }
}

/**
 * Add a routed path to a road network, joining each cell to the next.
 * @param {ArmNetwork} roads @param {[number, number][]} path
 */
export function layRoad(roads, path) {
  for (let i = 1; i < path.length; i++) {
    const [ax, ay] = path[i - 1];
    const [bx, by] = path[i];
    const arm = /** @type {readonly [Arm, number, number]} */ (
      ARMS.find(([, dx, dy]) => ax + dx === bx && ay + dy === by)
    )[0];
    roads.join(ax, ay, arm);
  }
}

/**
 * The Manhattan distance from (x, y) to the nearest of `points`.
 * @param {[number, number][]} points
 * @returns {(x: number, y: number) => number}
 */
export function distanceTo(points) {
  return (x, y) => Math.min(...points.map(([px, py]) => Math.abs(px - x) + Math.abs(py - y)));
}
