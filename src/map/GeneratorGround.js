import { createTile } from './TileGrid.js';
import { tileIdAt } from './MapGeometry.js';
import { ArmNetwork, coastOverlays, smoothCoastline } from './Autotile.js';
import { BIOME_TERRAIN, TERRAIN_PROFILES, terrainField } from './GeneratorTerrain.js';
import { traceRivers } from './GeneratorRivers.js';
import { bridgeAt } from './GeneratorRoads.js';
import { guidedField } from './GeneratorGuide.js';

/** @typedef {import('../types/map.js').Tile} Tile */
/** @typedef {import('./TilePalette.js').TilePalette} TilePalette */
/** @typedef {import('../types/map.js').TerrainGuide} TerrainGuide */

/** The share of the usual river count that a guided map traces on its own. */
const GUIDED_RIVERS = 0.5;

/**
 * The ground of the open maps. `wildTerrain` builds the classified cells and
 * the rivers of a climate archetype, and `terrainTiles` draws cells, rivers,
 * and roads as tiles. `southLanding` finds the entry of a map with no road
 * off it. The wilderness, the town, and the world generators all use this
 * module.
 */

/**
 * @typedef {{
 *   size: number,
 *   cells: string[],
 *   biomes: string[],
 *   elevation: Float64Array,
 *   rivers: ArmNetwork,
 *   roads: ArmNetwork,
 *   painted?: Uint8Array,
 * }} WildTerrain
 * `cells` is the terrain class per cell and `biomes` the finer biome
 * per cell, both indexed `y * size + x`. `roads` starts empty. A guided map
 * has `painted`, with 1 for each cell that it keeps and 0 for each cell
 * outside the outline of its block, which gets no tile.
 */

/**
 * The Chebyshev distance between two cells: the number of king moves from
 * one to the other.
 * @param {number} ax @param {number} ay @param {number} bx @param {number} by
 */
export const chebyshev = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));

/**
 * The largest land mass of a map: the land cells that join the most other
 * land cells by steps north, south, east, and west. The first mass in
 * row-major order wins a tie.
 * @param {string[]} cells terrain class per cell, indexed `y * size + x`
 * @param {number} size
 * @returns {Set<number>} the cell indexes of the mass, empty with no land
 */
export function largestLand(cells, size) {
  const seen = new Uint8Array(cells.length);
  /** @type {number[]} */
  let best = [];
  for (let i = 0; i < cells.length; i++) {
    if (seen[i] || cells[i] === 'water') continue;
    seen[i] = 1;
    const mass = [i];
    for (let q = 0; q < mass.length; q++) {
      const x = mass[q] % size;
      const y = Math.floor(mass[q] / size);
      for (const [nx, ny] of [
        [x, y - 1],
        [x, y + 1],
        [x - 1, y],
        [x + 1, y],
      ]) {
        const j = ny * size + nx;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size || seen[j] || cells[j] === 'water') {
          continue;
        }
        seen[j] = 1;
        mass.push(j);
      }
    }
    if (mass.length > best.length) best = mass;
  }
  return new Set(best);
}

/**
 * The land cell nearest the middle of the south border, where one row north
 * counts as two columns across. A map ringed by sea enters here, so a party
 * lands on the shore instead of in the sea. A map with land at the middle
 * of its south border enters on that border tile. The entry is on the
 * largest land mass (see `largestLand`), because a party that lands on a
 * small islet cannot walk to the sites of the main island. A mass whose
 * every cell `skip` refuses gives the entry to the nearest land cell of any
 * mass.
 * @param {string[]} cells terrain class per cell, indexed `y * size + x`
 * @param {number} size
 * @param {(i: number) => boolean} [skip] cells that cannot take the entry
 * @returns {string} the tile id, or the middle of the south border on a map
 *   with no land
 */
export function southLanding(cells, size, skip = () => false) {
  const mid = Math.floor(size / 2);
  const main = largestLand(cells, size);
  /** @param {(i: number) => boolean} fits */
  const nearest = (fits) => {
    let at = -1;
    let best = Infinity;
    for (let i = 0; i < cells.length; i++) {
      const d = Math.abs((i % size) - mid) + (size - 1 - Math.floor(i / size)) * 2;
      if (cells[i] !== 'water' && d < best && !skip(i) && fits(i)) [at, best] = [i, d];
    }
    return at < 0 ? null : tileIdAt(at % size, Math.floor(at / size));
  };
  return nearest((i) => main.has(i)) ?? nearest(() => true) ?? tileIdAt(mid, size - 1);
}

/**
 * The terrain of one open-terrain map before any tile exists: classified
 * cells with shorelines the coast pieces can draw, and rivers. Rivers are
 * traced after the coastline is smoothed, because smoothing turns narrow
 * land into water and a river traced first could end up inside a lake.
 * With a `guide`, the cells and the main rivers follow the parent terrain
 * (`GeneratorGuide.guidedField`), and the tracer adds `GUIDED_RIVERS` of
 * the usual river count as smaller rivers that join them.
 * @param {number} size
 * @param {string} archetype a key of TERRAIN_PROFILES
 * @param {() => number} rng
 * @param {TerrainGuide} [guide]
 * @returns {WildTerrain}
 */
export function wildTerrain(size, archetype, rng, guide) {
  const profile = TERRAIN_PROFILES[archetype] ?? TERRAIN_PROFILES.wilderness;
  const { field, rivers, painted } = guide
    ? guidedField(size, guide, rng)
    : { field: terrainField(size, profile, rng), rivers: undefined, painted: undefined };
  let cells = smoothCoastline(field.cells, size, size);
  const share = guide ? GUIDED_RIVERS : 1;
  const count = Math.round(profile.rivers * Math.max(1, size / 12) * share);
  const { network, ponds } = traceRivers(
    { size, elevation: field.elevation, cells },
    count,
    rng,
    rivers,
  );
  for (const i of ponds) cells[i] = 'water';
  if (ponds.length) cells = smoothCoastline(cells, size, size);
  // A pond can widen the water it joins, so a river cell can end up under
  // water. The channel beside it still points into that water, so it drains
  // there.
  const biomes = field.biomes.map((b, i) =>
    cells[i] === 'water' && b !== 'deep-water' ? 'water' : b,
  );
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] === 'water' || painted?.[i] === 0) network.drop(i % size, Math.floor(i / size));
  }
  return {
    size,
    cells,
    biomes,
    elevation: field.elevation,
    rivers: network,
    roads: new ArmNetwork(),
    ...(painted ? { painted } : {}),
  };
}

/**
 * Turn classified terrain into tiles. Each cell gets the variant of its
 * biome that its position picks (`TilePalette.variantAt`), or of its terrain
 * class where a later step changed the class, plus
 * its shoreline, river, and road overlays. The shoreline draws under the
 * channel, so a river drains through the beach into the water, and the
 * channel draws under the road. Where a road crosses a river, the bridge
 * piece draws in place of both, or the ford piece for a crossing in
 * `fords`. Cells in `bare` get no overlay, because a marker covers them and
 * an overlay would draw over its art.
 * @param {TilePalette} palette
 * @param {Pick<WildTerrain, 'size' | 'cells' | 'rivers' | 'roads'> & {
 *   biomes?: string[],
 *   fords?: ReadonlySet<string>,
 * }} terrain the town generator passes no biomes, so each cell draws its class
 * @param {() => number} rng
 * @param {ReadonlySet<string>} [bare] tile ids that take no overlay
 * @returns {Tile[]}
 */
export function terrainTiles(palette, terrain, rng, bare = new Set()) {
  const { size, cells, biomes, fords, rivers, roads } = terrain;
  const coast = coastOverlays(cells, size, size);
  const channel = rivers.pieces();
  const paths = roads.pieces();
  /** @type {Tile[]} */
  const tiles = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const id = tileIdAt(x, y);
      const type = cells[y * size + x];
      const biome = biomes?.[y * size + x];
      const art = biome && BIOME_TERRAIN[biome] === type ? biome : type;
      const base = palette.variantAt(art, x, y, rng).imageRef;
      if (bare.has(id)) {
        tiles.push(createTile(id, base));
        continue;
      }
      const crossing = paths.has(id) ? bridgeAt(rivers, x, y) : null;
      const bridge = crossing && fords?.has(id) ? crossing.replace('bridge', 'ford') : crossing;
      const shore = coast.get(id);
      const river = bridge ?? channel.get(id);
      const road = bridge ? undefined : paths.get(id);
      const refs = [
        shore && palette.getCoastPiece(shore),
        river && palette.getRiverPiece(river),
        road && palette.getRoadPiece(road),
      ]
        .filter((piece) => piece)
        .map((piece) => /** @type {{ imageRef: string }} */ (piece).imageRef);
      tiles.push(
        createTile(id, base, refs.length ? { overlayRef: refs.length > 1 ? refs : refs[0] } : {}),
      );
    }
  }
  return tiles;
}
