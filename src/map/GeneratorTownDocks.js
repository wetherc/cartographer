import { ARMS, OPPOSITE, coastOverlays } from './Autotile.js';
import { chebyshev } from './GeneratorGround.js';
import { ROAD_COST, layRoad, routeRoad } from './GeneratorRoads.js';
import { shuffle } from './GeneratorRandom.js';
import { maskAt, tileIdAt } from './MapGeometry.js';

/** @typedef {import('../types/map.js').TownDock} TownDock */
/** @typedef {import('./Autotile.js').Arm} Arm */
/** @typedef {import('./GeneratorRoads.js').RoadGround} RoadGround */

/**
 * The piers of a port town. Each pier starts at a quay on a straight piece
 * of shore, runs straight out over the sea, and ends at a pier head. A
 * street links the quay to the streets of the town. The dock pieces in
 * `assets/tiles/dock/` draw the plan, and every piece is `plain`, so the
 * party can walk from the streets out to each pier head.
 */

/**
 * @typedef {{
 *   quay: [number, number],
 *   behind: [number, number],
 *   pier: [number, number][],
 * }} DockSpot
 * `behind` is the land cell on the far side of the quay from the sea,
 * where the street to the quay starts.
 */

/** @type {Record<Arm, readonly [number, number]>} the step toward each side */
const STEP = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };

/**
 * The most cells that a pier runs out over the sea on a map of `size`
 * cells: one cell for each ten cells of map side, from one to four.
 * @param {number} size
 * @returns {number}
 */
export const pierReach = (size) => Math.min(4, Math.max(1, Math.round(size / 10)));

/**
 * The number of piers that a port of `size` cells tries to build: one, or
 * two on a map of 22 cells or more.
 * @param {number} size
 * @returns {number}
 */
export const dockCount = (size) => (size >= 22 ? 2 : 1);

/**
 * Find each shore cell that can take a quay for a sea on `side`. The quay
 * cell has the straight coast piece of that side, and no street, river, or
 * wall on it or beside it along the shore. The cell behind it is a street,
 * or land that a street can cross, with no river or wall. The pier runs
 * straight out from the quay over water, with water on both sides of each
 * pier cell, so no pier runs along the shore. The pier stops one cell short of the open sea where the water
 * is deep enough, and never runs past `pierReach`.
 * @param {RoadGround} ground
 * @param {Arm} side the border side of the sea
 * @param {ReadonlyMap<string, string>} walls the town wall pieces by tile id
 * @returns {DockSpot[]} in row order
 */
export function dockSpots(ground, side, walls) {
  const { size, cells, rivers, roads } = ground;
  const coast = coastOverlays(cells, size, size);
  const water = maskAt(cells, size, size, 'water');
  const [dx, dy] = STEP[side];
  // One step along the shore, at a right angle to the pier.
  const [ax, ay] = [dy, dx];
  /** @param {number} x @param {number} y */
  const inside = (x, y) => x >= 0 && y >= 0 && x < size && y < size;
  /** @param {number} x @param {number} y */
  const busy = (x, y) => rivers.has(x, y) || roads.has(x, y) || walls.has(tileIdAt(x, y));
  const reach = pierReach(size);
  /** @type {DockSpot[]} */
  const spots = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (coast.get(tileIdAt(x, y)) !== side || busy(x, y)) continue;
      if (!inside(x - ax, y - ay) || !inside(x + ax, y + ay)) continue;
      if (busy(x - ax, y - ay) || busy(x + ax, y + ay)) continue;
      const [bx, by] = [x - dx, y - dy];
      const land = cells[by * size + bx];
      if (
        !inside(bx, by) ||
        rivers.has(bx, by) ||
        walls.has(tileIdAt(bx, by)) ||
        !(land in ROAD_COST)
      )
        continue;
      let run = 0;
      while (water(x + dx * (run + 1), y + dy * (run + 1))) run++;
      /** @type {[number, number][]} */
      const pier = [];
      for (let k = 1; k <= Math.min(reach, Math.max(1, run - 1)); k++) {
        const [px, py] = [x + dx * k, y + dy * k];
        if (!water(px, py) || !water(px - ax, py - ay) || !water(px + ax, py + ay)) break;
        pier.push([px, py]);
      }
      if (pier.length) spots.push({ quay: [x, y], behind: [bx, by], pier });
    }
  }
  return spots;
}

/**
 * The number of steps from each cell to the nearest cell where `goal`
 * holds, across open ground. A street between the two is never shorter,
 * so the count is a lower bound on its length.
 * @param {number} size @param {(x: number, y: number) => boolean} goal
 * @returns {Int32Array} indexed `y * size + x`, or -1 with no goal cell
 */
export function stepsTo(size, goal) {
  const steps = new Int32Array(size * size).fill(-1);
  /** @type {number[]} */
  const queue = [];
  for (let i = 0; i < steps.length; i++) {
    if (goal(i % size, Math.floor(i / size))) {
      steps[i] = 0;
      queue.push(i);
    }
  }
  for (let q = 0; q < queue.length; q++) {
    const [x, y] = [queue[q] % size, Math.floor(queue[q] / size)];
    for (const [, dx, dy] of ARMS) {
      const [nx, ny] = [x + dx, y + dy];
      const next = ny * size + nx;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size || steps[next] !== -1) continue;
      steps[next] = steps[queue[q]] + 1;
      queue.push(next);
    }
  }
  return steps;
}

/**
 * Plan the piers of a port and lay the street to each one. The spots from
 * `dockSpots` are tried in a random order, and the one with the shortest
 * street to the town wins. The spots nearest a street go first, and the
 * search stops when no spot left can beat the best street. On a port of 48
 * cells, a street search for every spot takes about 16 ms, and this order
 * takes about 1 ms. A later pier keeps at least four cells from an
 * earlier one, and its street can join the street of the earlier pier. A
 * street to a quay starts straight inland from it, keeps off the shore
 * and the wall, and meets a street that is not a gate, so the quay art
 * joins its street and no street runs into a wall from the side. A port
 * where no spot has a street gets no pier.
 * @param {RoadGround} ground the town streets; this adds the new streets
 * @param {Arm} side the border side of the sea
 * @param {() => number} rng
 * @param {ReadonlyMap<string, string>} [walls] the town wall pieces by tile id
 * @returns {TownDock[]}
 */
export function planDocks(ground, side, rng, walls = new Map()) {
  const { size, cells, roads } = ground;
  const coast = coastOverlays(cells, size, size);
  const spots = shuffle(dockSpots(ground, side, walls), rng);
  const heading = ARMS.findIndex(([arm]) => arm === OPPOSITE[side]);
  /** @type {DockSpot[]} */
  const chosen = [];
  /** @param {number} x @param {number} y */
  const onRoad = (x, y) => roads.has(x, y) && !walls.has(tileIdAt(x, y));
  /** @param {number} x @param {number} y */
  const blocked = (x, y) => walls.has(tileIdAt(x, y)) || coast.has(tileIdAt(x, y));
  for (let n = 0; n < dockCount(size); n++) {
    const steps = stepsTo(size, onRoad);
    /** @param {[number, number]} cell */
    const bound = ([x, y]) => steps[y * size + x];
    /** @param {number} x @param {number} y */
    const estimate = (x, y) => steps[y * size + x];
    const order = spots
      .filter(({ behind }) => bound(behind) >= 0)
      .sort((a, b) => bound(a.behind) - bound(b.behind));
    /** @type {{ spot: DockSpot, path: [number, number][] } | null} */
    let best = null;
    for (const spot of order) {
      if (best && best.path.length <= bound(spot.behind) + 1) break;
      const [x, y] = spot.quay;
      if (chosen.some(({ quay: [qx, qy] }) => chebyshev(x, y, qx, qy) < 4)) continue;
      const path = onRoad(...spot.behind)
        ? [spot.behind]
        : routeRoad({ ...ground, blocked }, spot.behind, onRoad, estimate, heading);
      if (path && (!best || path.length < best.path.length)) best = { spot, path };
    }
    if (!best) break;
    layRoad(roads, [best.spot.quay, ...best.path]);
    chosen.push(best.spot);
  }
  return chosen.map(({ quay, pier }) => ({
    side,
    quay: tileIdAt(...quay),
    pier: pier.map(([x, y]) => tileIdAt(x, y)),
  }));
}
