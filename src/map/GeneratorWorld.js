import { NEIGHBORS4, tileIdAt } from './MapGeometry.js';
import { randInt } from './GeneratorRandom.js';
import { southLanding, terrainTiles, wildTerrain } from './GeneratorGround.js';
import { guideSize, terrainGuide } from './GeneratorGuide.js';

/** @typedef {import('../types/map.js').Tile} Tile */
/** @typedef {import('../types/map.js').GeneratedSite} GeneratedSite */
/** @typedef {import('./TilePalette.js').TilePalette} TilePalette */

/**
 * The world archetype: a continent in a sea, split into regions. The
 * terrain comes from the continent climate profile, with rivers but no roads
 * or settlements, because each region gets those on its own map. Every
 * region is a block of land tiles that all link to one child region map.
 */

/** The land cells that one region covers, on average. */
const REGION_CELLS = 80;

/** The most regions one world gets. */
const MAX_REGIONS = 9;

/** A land mass with fewer cells than this gets no region of its own. */
const MIN_ISLAND = 12;

/**
 * The region archetype for the terrain of a block, and the environ that
 * goes with it. Mountains and hills make highlands, snow makes a frontier,
 * sand makes a desert, and swamp makes wetlands. Any other block is
 * wilderness.
 * @param {string[]} types the terrain class of each cell in the block
 * @returns {{ archetype: string, environ: string }}
 */
export function regionFor(types) {
  /** @param {string[]} of */
  const share = (...of) => types.filter((t) => of.includes(t)).length / types.length;
  if (share('mountain', 'hills') > 0.35) return { archetype: 'highlands', environ: 'mountain' };
  if (share('snow') > 0.35) return { archetype: 'frontier', environ: 'tundra' };
  if (share('desert') > 0.35) return { archetype: 'desert', environ: 'desert' };
  if (share('swamp') > 0.2) return { archetype: 'wetlands', environ: 'swamp' };
  return { archetype: 'wilderness', environ: share('forest') > 0.35 ? 'forest' : 'grassland' };
}

/**
 * Split the land of a map into contiguous regions. The regions of the
 * largest land mass start from seeds spread across it: the first seed is a
 * random cell, and each later seed is the cell farthest from every seed so
 * far. Each region then grows from its seed one ring of neighbors at a time,
 * over land only, so every region is one connected block. Each other land
 * mass with at least `MIN_ISLAND` cells becomes one region of its own, while
 * the regions last, and a smaller island stays out of every region.
 * @param {string[]} cells terrain class per cell, indexed `y * size + x`
 * @param {number} size
 * @param {() => number} rng
 * @returns {Int32Array} the region index of each cell, or -1 for none
 */
export function partitionLand(cells, size, rng) {
  /**
   * Spread the labels of `starts` over the unlabeled land around them.
   * @param {Int32Array} into @param {number[]} starts
   * @returns {number[]} every cell reached, starts first
   */
  const flood = (into, starts) => {
    const queue = [...starts];
    for (let q = 0; q < queue.length; q++) {
      const i = queue[q];
      for (const [dx, dy] of NEIGHBORS4) {
        const x = (i % size) + dx;
        const y = Math.floor(i / size) + dy;
        const n = y * size + x;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        if (into[n] !== -1 || cells[n] === 'water') continue;
        into[n] = into[i];
        queue.push(n);
      }
    }
    return queue;
  };
  const mass = new Int32Array(size * size).fill(-1);
  /** @type {number[][]} */
  const masses = [];
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] === 'water' || mass[i] !== -1) continue;
    mass[i] = masses.length;
    masses.push(flood(mass, [i]));
  }
  const region = new Int32Array(size * size).fill(-1);
  if (!masses.length) return region;
  masses.sort((a, b) => b.length - a.length);
  const [main, ...islands] = masses;
  const count = Math.min(MAX_REGIONS, Math.max(1, Math.round(main.length / REGION_CELLS)));
  const seeds = [main[randInt(rng, main.length)]];
  /**
   * The squared distance between two cells. It orders the cells in the same
   * way as the distance, and integer arithmetic gives the same result in
   * every browser engine, where Math.hypot can round differently.
   * @param {number} a @param {number} b
   */
  const gap = (a, b) => {
    const dx = (a % size) - (b % size);
    const dy = Math.floor(a / size) - Math.floor(b / size);
    return dx * dx + dy * dy;
  };
  while (seeds.length < count) {
    let far = main[0];
    let best = -1;
    for (const i of main) {
      const d = Math.min(...seeds.map((s) => gap(i, s)));
      if (d > best) {
        best = d;
        far = i;
      }
    }
    seeds.push(far);
  }
  seeds.forEach((s, k) => {
    region[s] = k;
  });
  flood(region, seeds);
  let next = count;
  for (const island of islands) {
    if (next >= MAX_REGIONS) break;
    if (island.length < MIN_ISLAND) continue;
    region[island[0]] = next++;
    flood(region, [island[0]]);
  }
  return region;
}

/**
 * Generate a world map. Each region is a site whose tiles all link to one
 * child region, with the archetype that its terrain calls for. The site
 * has the guide of its bounding box (`GeneratorGuide.terrainGuide`), so
 * the region map draws the land of its block, and its size preset follows
 * the size of the block (`GeneratorGuide.guideSize`). The
 * entry is the land cell nearest the middle of the south border, so a party
 * that the regeneration moves lands on the shore instead of in the sea.
 * @param {TilePalette} palette @param {number} size @param {() => number} rng
 * @returns {{ tiles: Tile[], entry: string, sites: GeneratedSite[] }}
 */
export function generateWorld(palette, size, rng) {
  const terrain = wildTerrain(size, 'continent', rng);
  const tiles = terrainTiles(palette, terrain, rng);
  const region = partitionLand(terrain.cells, size, rng);
  /** @type {Map<number, number[]>} */
  const blocks = new Map();
  region.forEach((r, i) => {
    if (r < 0) return;
    const block = blocks.get(r) ?? [];
    if (!block.length) blocks.set(r, block);
    block.push(i);
  });
  /** @type {GeneratedSite[]} */
  const sites = [...blocks.keys()]
    .sort((a, b) => a - b)
    .map((r) => {
      const block = /** @type {number[]} */ (blocks.get(r));
      const { archetype, environ } = regionFor(block.map((i) => terrain.cells[i]));
      const tileIds = block.map((i) => tileIdAt(i % size, Math.floor(i / size)));
      const guide = terrainGuide(tiles, tileIds);
      const kind = /** @type {const} */ ('region');
      return { tileIds, archetype, kind, environ, size: guideSize(guide), label: archetype, guide };
    });
  return { tiles, entry: southLanding(terrain.cells, size), sites };
}
