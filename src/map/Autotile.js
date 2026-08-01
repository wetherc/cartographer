import { maskAt, tileIdAt } from './MapGeometry.js';

/**
 * This module gives pure helper functions. The functions select connector
 * overlay pieces for coast shorelines and river channels from a terrain grid.
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

/**
 * River piece that connects two named edges of one tile. For example, n+s
 * gives "v".
 * @type {Record<string, string>}
 */
const RIVER_PIECES = {
  'n,s': 'v',
  'e,w': 'h',
  'e,n': 'corner-ne',
  'n,w': 'corner-nw',
  'e,s': 'corner-se',
  's,w': 'corner-sw',
};

/**
 * This function creates a meandering river: a south-biased random walk from
 * the north edge to the south edge. The walk never doubles back on itself.
 * The function returns the channel piece for each visited tile id. If the
 * walk reaches existing water, it ends early and the river empties into a
 * lake.
 * @param {number} width @param {number} height
 * @param {() => number} rng
 * @param {(x: number, y: number) => boolean} [isWater]
 * @returns {Map<string, string>}
 */
export function riverCourse(width, height, rng, isWater = () => false) {
  /** @type {Map<string, string>} */
  const out = new Map();
  let x = Math.floor(width / 4 + rng() * (width / 2));
  let from = 'n';
  for (let y = 0; y < height;) {
    if (isWater(x, y)) break;
    let to = rng() < 0.6 ? 's' : rng() < 0.5 ? 'e' : 'w';
    if (to === from) to = 's'; // The walk cannot exit through the edge it entered from.
    if (to === 'e' && (x + 1 >= width || isWater(x + 1, y))) to = 's';
    if (to === 'w' && (x - 1 < 0 || isWater(x - 1, y))) to = 's';
    out.set(tileIdAt(x, y), RIVER_PIECES[[from, to].sort().join(',')]);
    if (to === 's') {
      y++;
      from = 'n';
    } else if (to === 'e') {
      x++;
      from = 'w';
    } else {
      x--;
      from = 'e';
    }
  }
  return out;
}
