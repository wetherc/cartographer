import { ARMS, ArmNetwork } from './Autotile.js';
import { shuffle } from './GeneratorRandom.js';

/** @typedef {import('./Autotile.js').Arm} Arm */

/**
 * Rivers for the open-terrain generators. Each river starts on high ground
 * and walks to the lowest free neighbor until it reaches water, the map
 * edge, or another river. A river that reaches another river joins it,
 * so tributaries form tees, or a cross where the other river already has
 * a tee. A river that reaches a sink, with no lower
 * ground to go to, ends in a pond there.
 */

/**
 * How far uphill, in stretched elevation, one river step may go. The small
 * allowance lets a river cross the ripples of the noise without pooling in
 * every shallow dip.
 */
const CLIMB = 0.02;

/**
 * @typedef {{
 *   network: ArmNetwork,
 *   ponds: number[],
 * }} RiverResult
 * `ponds` lists the cells, as `y * size + x`, that a river ended in and
 * that the caller turns to water.
 */

/**
 * Trace `count` rivers over a classified map. `cells` is the drawn terrain
 * type per cell. Rivers do not enter water or mountain cells, and never run
 * beside water or beside another river without joining it. A river shorter
 * than three cells is dropped, because a one- or two-cell stub reads as a
 * puddle.
 * @param {{ size: number, elevation: Float64Array, cells: string[] }} field
 * @param {number} count
 * @param {() => number} rng
 * @param {ArmNetwork} [network] rivers already on the map, which the new
 *   rivers join and keep three cells away from at their sources
 * @returns {RiverResult}
 */
export function traceRivers({ size, elevation, cells }, count, rng, network = new ArmNetwork()) {
  /** @type {number[]} */
  const ponds = [];
  /** @param {number} x @param {number} y */
  const inside = (x, y) => x >= 0 && y >= 0 && x < size && y < size;
  /** @param {number} x @param {number} y */
  const type = (x, y) => cells[y * size + x];
  /** @param {number} x @param {number} y */
  const open = (x, y) => inside(x, y) && type(x, y) !== 'water' && type(x, y) !== 'mountain';
  /** @param {number} x @param {number} y */
  const nearMountain = (x, y) =>
    ARMS.some(([, dx, dy]) => inside(x + dx, y + dy) && type(x + dx, y + dy) === 'mountain');

  // Sources are the highest open cells: hills, and the ground at the foot
  // of a range. Taking a shuffle of the top few keeps the choice seeded but
  // not always the single highest cell.
  /** @type {[number, number][]} */
  const high = [];
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      if (open(x, y) && (type(x, y) === 'hills' || nearMountain(x, y))) high.push([x, y]);
    }
  }
  high.sort((a, b) => elevation[b[1] * size + b[0]] - elevation[a[1] * size + a[0]]);
  const sources = shuffle(high.slice(0, Math.max(count * 4, 8)), rng);

  let made = 0;
  for (const [sx, sy] of sources) {
    if (made >= count) break;
    if (network.near(sx, sy, 3)) continue;
    if (walk(sx, sy)) made++;
  }
  return { network, ponds };

  /**
   * Walk one river from a source and add it to the network.
   * @param {number} sx @param {number} sy
   * @returns {boolean} whether the river was kept
   */
  function walk(sx, sy) {
    /** @type {[number, number][]} */
    const path = [[sx, sy]];
    const onPath = new Set([sy * size + sx]);
    /** @param {number} x @param {number} y @param {number} px @param {number} py */
    const touchesPath = (x, y, px, py) =>
      ARMS.some(
        ([, dx, dy]) => !(x + dx === px && y + dy === py) && onPath.has((y + dy) * size + (x + dx)),
      );
    /**
     * @type {{ x: number, y: number, joins: Arm[], drain?: Arm } | null}
     * the head where the river leaves the path: the arms toward each river
     * it joins, and the arm into water or off the map
     */
    let mouth = null;
    let pond = false;
    for (let steps = 0; steps < size * size; steps++) {
      const [x, y] = path[path.length - 1];
      const here = elevation[y * size + x];
      // Water or another river beside the head ends the walk there. The
      // head joins every river beside it, so no two channels run side by
      // side, and it drains into the first water beside it.
      const joins = ARMS.filter(([, dx, dy]) => network.has(x + dx, y + dy)).map(([arm]) => arm);
      const water = ARMS.find(
        ([, dx, dy]) => inside(x + dx, y + dy) && type(x + dx, y + dy) === 'water',
      );
      if (joins.length || water) {
        mouth = { x, y, joins, drain: water?.[0] };
        break;
      }
      const moves = ARMS.map(([arm, dx, dy]) => ({ arm, x: x + dx, y: y + dy })).filter(
        (m) =>
          open(m.x, m.y) &&
          elevation[m.y * size + m.x] <= here + CLIMB &&
          !onPath.has(m.y * size + m.x) &&
          !touchesPath(m.x, m.y, x, y),
      );
      const scored = moves.map((m) => ({
        ...m,
        score: elevation[m.y * size + m.x] + rng() * 0.03,
      }));
      scored.sort((a, b) => a.score - b.score);
      const best = scored[0];
      const edgeArm = ARMS.find(([, dx, dy]) => !inside(x + dx, y + dy));
      // A river on the border leaves the map when nothing inside is lower.
      if (edgeArm && (!best || elevation[best.y * size + best.x] >= here)) {
        mouth = { x, y, joins: [], drain: edgeArm[0] };
        break;
      }
      if (!best) {
        pond = true;
        break;
      }
      path.push([best.x, best.y]);
      onPath.add(best.y * size + best.x);
    }
    if (path.length < 3) return false;
    for (let i = 1; i < path.length; i++) {
      const [ax, ay] = path[i - 1];
      const [bx, by] = path[i];
      const arm = /** @type {readonly [Arm, number, number]} */ (
        ARMS.find(([, dx, dy]) => ax + dx === bx && ay + dy === by)
      )[0];
      network.join(ax, ay, arm);
    }
    if (mouth) {
      // A join adds an arm on both sides. A drain into water or off the map
      // adds an arm to the head only.
      for (const arm of mouth.joins) network.join(mouth.x, mouth.y, arm);
      if (mouth.drain) network.add(mouth.x, mouth.y, mouth.drain);
    } else if (pond) {
      // The head becomes a pond. The cell before it drains into the pond.
      const [px, py] = path[path.length - 1];
      network.drop(px, py);
      ponds.push(py * size + px);
    }
    return true;
  }
}
