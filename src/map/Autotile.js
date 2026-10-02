import { maskAt, tileIdAt } from './MapGeometry.js';

/**
 * This module gives pure helper functions. The functions select connector
 * overlay pieces for coast shorelines, and for road and river networks, from a
 * terrain grid.
 * A terrain grid is a flat array of strings, indexed as `y * width + x`. This
 * index method matches the generators in MapGenerator.js. Each function takes
 * RNG as an input and does not use the DOM, so each function passes unit
 * tests directly.
 */

/**
 * Widen water until each land cell borders water on at most two adjacent
 * edges. The coast overlay pieces can draw only these shapes. A land cell
 * with water on opposite sides (a one-tile isthmus) becomes water. A land
 * cell with water on three or more sides (a spit) becomes water. The
 * function repeats until the grid is stable.
 * @param {string[]} cells terrain type per cell
 * @param {number} width @param {number} height
 * @returns {string[]} a new cells array
 */
export function smoothCoastline(cells, width, height) {
  const out = [...cells];
  const water = maskAt(out, width, height, 'water');
  let changed = true;
  while (changed) {
    changed = false;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (water(x, y)) continue;
        const n = water(x, y - 1);
        const e = water(x + 1, y);
        const s = water(x, y + 1);
        const w = water(x - 1, y);
        if (Number(n) + Number(e) + Number(s) + Number(w) >= 3 || (n && s) || (e && w)) {
          out[y * width + x] = 'water';
          changed = true;
        }
      }
    }
  }
  return out;
}

/**
 * Coast piece for a land cell with water neighbors. Coast names describe
 * where the water sits. Two adjacent water edges give an outer corner. One
 * water edge gives a straight piece. A diagonal-only water touch gives an
 * inner corner. No water gives no overlay (null). This function assumes
 * smoothCoastline already processed the grid, so the opposite-edge and
 * three-edge cases cannot occur here.
 * @param {boolean} n @param {boolean} e @param {boolean} s @param {boolean} w
 * @param {boolean} ne @param {boolean} se @param {boolean} sw @param {boolean} nw
 * @returns {string | null}
 */
export function coastKind(n, e, s, w, ne, se, sw, nw) {
  if (n && e) return 'corner-ne';
  if (n && w) return 'corner-nw';
  if (s && e) return 'corner-se';
  if (s && w) return 'corner-sw';
  if (n) return 'n';
  if (e) return 'e';
  if (s) return 's';
  if (w) return 'w';
  if (ne) return 'inner-ne';
  if (nw) return 'inner-nw';
  if (se) return 'inner-se';
  if (sw) return 'inner-sw';
  return null;
}

/**
 * Coast overlay kind for each land cell that borders water, keyed by tile
 * id. An off-grid neighbor counts as land. So water that runs off the map
 * edge does not grow a shoreline there.
 * @param {string[]} cells @param {number} width @param {number} height
 * @returns {Map<string, string>}
 */
export function coastOverlays(cells, width, height) {
  /** @type {Map<string, string>} */
  const out = new Map();
  const water = maskAt(cells, width, height, 'water');
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (water(x, y)) continue;
      const kind = coastKind(
        water(x, y - 1),
        water(x + 1, y),
        water(x, y + 1),
        water(x - 1, y),
        water(x + 1, y - 1),
        water(x + 1, y + 1),
        water(x - 1, y + 1),
        water(x - 1, y - 1),
      );
      if (kind) out.set(tileIdAt(x, y), kind);
    }
  }
  return out;
}

/** @typedef {'n' | 'e' | 's' | 'w'} Arm */

/**
 * The four arm directions as `[arm, dx, dy]`, in a fixed order. Walks that
 * consume a seeded RNG iterate this list, so the order stays stated once.
 * @type {ReadonlyArray<readonly [Arm, number, number]>}
 */
export const ARMS = [
  ['n', 0, -1],
  ['e', 1, 0],
  ['s', 0, 1],
  ['w', -1, 0],
];

/** @type {Record<Arm, Arm>} */
export const OPPOSITE = { n: 's', e: 'w', s: 'n', w: 'e' };

/**
 * The connector piece for a road or river tile whose channel leaves through
 * the given edges. Road and river art share these fifteen names. Four arms
 * make a cross. Three arms make a tee named for the arm opposite the missing
 * one, so `tee-n` runs east-west with a branch north. Two arms make a
 * straight or a corner, and one arm makes a dead end named for its open
 * edge. No arm gives null.
 * @param {ReadonlySet<Arm>} arms
 * @returns {string | null}
 */
export function connectorKind(arms) {
  const n = arms.has('n');
  const e = arms.has('e');
  const s = arms.has('s');
  const w = arms.has('w');
  const count = arms.size;
  if (count === 4) return 'cross';
  if (count === 3) return !s ? 'tee-n' : !w ? 'tee-e' : !n ? 'tee-s' : 'tee-w';
  if (count === 2) {
    if (n && s) return 'v';
    if (e && w) return 'h';
    return `corner-${n ? 'n' : 's'}${e ? 'e' : 'w'}`;
  }
  if (count === 1) return `end-${[...arms][0]}`;
  return null;
}

/**
 * Edge sets for a connector network, such as the rivers or the roads of one
 * map, keyed by tile id. A network records the edges its paths cross, not
 * which cells it covers. Two channels that run side by side without joining
 * then stay two channels, where a piece picked from neighbor cells would
 * join them.
 *
 * `arms` lists the edge sets by tile id, for the callers that iterate the
 * network. `has` and `at` read a second map keyed by a number, because the
 * road search calls them for every step it tries. With a tile id string per
 * call, a generated island takes about 40% longer. Both maps share each
 * edge set.
 */
export class ArmNetwork {
  constructor() {
    /** @type {Map<string, Set<Arm>>} */
    this.arms = new Map();
    /** @type {Map<number, Set<Arm>>} */
    this.byKey = new Map();
  }

  /**
   * The numeric key of a cell. It is unique for each cell with an x
   * between -32768 and 32767, which covers every map and its border.
   * @param {number} x @param {number} y
   */
  static key(x, y) {
    return y * 65536 + x;
  }

  /**
   * Add one arm to a cell.
   * @param {number} x @param {number} y @param {Arm} arm
   */
  add(x, y, arm) {
    const key = ArmNetwork.key(x, y);
    let set = this.byKey.get(key);
    if (!set) {
      set = new Set();
      this.byKey.set(key, set);
      this.arms.set(tileIdAt(x, y), set);
    }
    set.add(arm);
  }

  /**
   * Join a cell to its neighbor across one edge: an arm on each side.
   * @param {number} x @param {number} y @param {Arm} arm
   */
  join(x, y, arm) {
    const [, dx, dy] = /** @type {readonly [Arm, number, number]} */ (
      ARMS.find(([a]) => a === arm)
    );
    this.add(x, y, arm);
    this.add(x + dx, y + dy, OPPOSITE[arm]);
  }

  /** @param {number} x @param {number} y @returns {ReadonlySet<Arm>} */
  at(x, y) {
    return this.byKey.get(ArmNetwork.key(x, y)) ?? new Set();
  }

  /** @param {number} x @param {number} y */
  has(x, y) {
    return this.byKey.has(ArmNetwork.key(x, y));
  }

  /**
   * Whether any cell within `r` of (x, y), in Chebyshev distance and with
   * (x, y) itself included, is in the network.
   * @param {number} x @param {number} y @param {number} r
   */
  near(x, y, r) {
    for (let yy = y - r; yy <= y + r; yy++) {
      for (let xx = x - r; xx <= x + r; xx++) if (this.has(xx, yy)) return true;
    }
    return false;
  }

  /**
   * Drop a cell from the network. Arms that neighbors point at it stay, so a
   * channel whose cell turned to water still drains into that water.
   * @param {number} x @param {number} y
   */
  drop(x, y) {
    this.byKey.delete(ArmNetwork.key(x, y));
    this.arms.delete(tileIdAt(x, y));
  }

  /**
   * The connector piece name for every cell in the network.
   * @returns {Map<string, string>}
   */
  pieces() {
    /** @type {Map<string, string>} */
    const out = new Map();
    for (const [id, set] of this.arms) {
      const kind = connectorKind(set);
      if (kind) out.set(id, kind);
    }
    return out;
  }
}
