/**
 * Pure helpers for picking connector overlay pieces (coast shorelines, river
 * channels) from a terrain grid. Terrain grids are flat string arrays indexed
 * `y * width + x`, matching the generators in MapGenerator.js; everything here
 * is RNG-injected and DOM-free so it unit-tests directly.
 */

/**
 * Widen water until every land cell borders water on at most two *adjacent*
 * edges — the only shapes the coast overlay pieces can draw. A land cell with
 * water on opposite sides (a one-tile isthmus) or three-plus sides (a spit)
 * becomes water itself, repeating until stable.
 * @param {string[]} cells terrain type per cell
 * @param {number} width @param {number} height
 * @returns {string[]} a new cells array
 */
export function smoothCoastline(cells, width, height) {
  const out = [...cells];
  const water = (/** @type {number} */ x, /** @type {number} */ y) =>
    x >= 0 && y >= 0 && x < width && y < height && out[y * width + x] === 'water';
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
 * Coast piece for a land cell from which neighbors are water. Coast names
 * describe where the water sits: two adjacent water edges make an outer
 * corner, one edge a straight, a diagonal-only touch an inner corner, and no
 * water at all means no overlay (null). Assumes the grid has been through
 * smoothCoastline, so opposite-edge and three-edge cases cannot occur.
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
 * Coast overlay kinds for every land cell that borders water, keyed by tile
 * id. Off-grid neighbors count as land, so water running off the map edge
 * doesn't grow a shoreline there.
 * @param {string[]} cells @param {number} width @param {number} height
 * @returns {Map<string, string>}
 */
export function coastOverlays(cells, width, height) {
  /** @type {Map<string, string>} */
  const out = new Map();
  const water = (/** @type {number} */ x, /** @type {number} */ y) =>
    x >= 0 && y >= 0 && x < width && y < height && cells[y * width + x] === 'water';
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (water(x, y)) continue;
      const kind = coastKind(
        water(x, y - 1), water(x + 1, y), water(x, y + 1), water(x - 1, y),
        water(x + 1, y - 1), water(x + 1, y + 1), water(x - 1, y + 1), water(x - 1, y - 1),
      );
      if (kind) out.set(`${x},${y}`, kind);
    }
  }
  return out;
}

/**
 * River piece connecting two named edges of one tile, e.g. n+s -> "v".
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
 * A meandering river: a south-biased random walk from the north edge to the
 * south edge that never doubles back on itself, returning the channel piece
 * per visited tile id. The walk ends early if it reaches existing water (the
 * river empties into a lake).
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
    if (to === from) to = 's'; // never exit the edge we entered from
    if (to === 'e' && (x + 1 >= width || isWater(x + 1, y))) to = 's';
    if (to === 'w' && (x - 1 < 0 || isWater(x - 1, y))) to = 's';
    out.set(`${x},${y}`, RIVER_PIECES[[from, to].sort().join(',')]);
    if (to === 's') { y++; from = 'n'; }
    else if (to === 'e') { x++; from = 'w'; }
    else { x--; from = 'e'; }
  }
  return out;
}
