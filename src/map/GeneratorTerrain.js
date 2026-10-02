import { fbm, quantile, stretch, valueNoise } from './GeneratorNoise.js';

/**
 * The climate model behind the open-terrain generators. Three noise fields
 * cover the map: elevation, moisture, and temperature. Each cell's biome
 * follows from its three values, so snow sits in the cold north and on high
 * ground, desert sits where it is hot and dry, and swamp sits in wet
 * lowland. Biomes change gradually across the map instead of at random.
 *
 * A profile tunes the fields for one archetype: how much of the map is
 * water, hills, and mountain, how warm and wet it is, and whether the land
 * falls away to sea at the edges (an island or a continent).
 */

/**
 * @typedef {{
 *   water: number,
 *   hills: number,
 *   mountain: number,
 *   warmth: number,
 *   wetness: number,
 *   falloff: number,
 *   shore: boolean,
 *   latitude: number,
 *   rivers: number,
 * }} TerrainProfile
 * `water`, `hills`, and `mountain` are fractions of the map. `warmth` and
 * `wetness` shift the temperature and moisture fields, where 0.5 is
 * temperate. `falloff` lowers land toward the edges, and `shore` makes the
 * whole border water. `latitude` is how much colder the north edge is than
 * the south edge. `rivers` scales the river count.
 */

/** @type {Record<string, TerrainProfile>} */
export const TERRAIN_PROFILES = {
  wilderness: {
    water: 0.12,
    hills: 0.14,
    mountain: 0.07,
    warmth: 0.5,
    wetness: 0.5,
    falloff: 0,
    shore: false,
    latitude: 0.5,
    rivers: 1,
  },
  highlands: {
    water: 0.05,
    hills: 0.3,
    mountain: 0.24,
    warmth: 0.42,
    wetness: 0.5,
    falloff: 0,
    shore: false,
    latitude: 0.3,
    rivers: 1.5,
  },
  frontier: {
    water: 0.12,
    hills: 0.14,
    mountain: 0.08,
    warmth: 0.12,
    wetness: 0.55,
    falloff: 0,
    shore: false,
    latitude: 0.6,
    rivers: 0.8,
  },
  desert: {
    water: 0.03,
    hills: 0.12,
    mountain: 0.06,
    warmth: 0.95,
    wetness: 0.12,
    falloff: 0,
    shore: false,
    latitude: 0.3,
    rivers: 0.4,
  },
  wetlands: {
    water: 0.2,
    hills: 0.05,
    mountain: 0.02,
    warmth: 0.55,
    wetness: 0.9,
    falloff: 0,
    shore: false,
    latitude: 0.3,
    rivers: 1.6,
  },
  island: {
    water: 0.5,
    hills: 0.1,
    mountain: 0.05,
    warmth: 0.62,
    wetness: 0.55,
    falloff: 1,
    shore: true,
    latitude: 0.2,
    rivers: 0.6,
  },
  continent: {
    water: 0.34,
    hills: 0.12,
    mountain: 0.07,
    warmth: 0.5,
    wetness: 0.5,
    falloff: 0.7,
    shore: true,
    latitude: 1,
    rivers: 1.2,
  },
};

/**
 * The terrain class of each biome. The generator rules read the class: a
 * road avoids mountain, a river rises in the hills, and a landmark prefers
 * grass. So jungle counts as forest and volcanic as mountain for these
 * rules. A tile still draws its biome's own art, unless a later step
 * changes the class of its cell, for example to farmland or to a pond.
 * @type {Record<string, string>}
 */
export const BIOME_TERRAIN = {
  'deep-water': 'water',
  water: 'water',
  grass: 'grass',
  savanna: 'grass',
  forest: 'forest',
  jungle: 'forest',
  taiga: 'forest',
  swamp: 'swamp',
  desert: 'desert',
  badlands: 'desert',
  hills: 'hills',
  'snow-hills': 'snow',
  mountain: 'mountain',
  'snow-mountain': 'mountain',
  volcanic: 'mountain',
  snow: 'snow',
  glacier: 'snow',
};

/**
 * @typedef {{ deep: number, sea: number, hill: number, mountain: number }} ElevationLines
 * Elevation thresholds: below `sea` is water, below `deep` is deep water,
 * at or above `hill` is hills, and at or above `mountain` is mountain.
 */

/**
 * The biome for one cell's elevation `e`, moisture `m`, and temperature `t`.
 * All three are near [0, 1]. Temperature below 0.28 counts as cold, and
 * hills need a little colder still, below 0.22, to hold snow.
 * @param {number} e @param {number} m @param {number} t
 * @param {ElevationLines} lines
 * @returns {string}
 */
export function classifyBiome(e, m, t, lines) {
  if (e < lines.sea) return e < lines.deep ? 'deep-water' : 'water';
  const cold = t < 0.28;
  if (e >= lines.mountain) {
    if (t > 0.85 && m < 0.35) return 'volcanic';
    return cold ? 'snow-mountain' : 'mountain';
  }
  if (e >= lines.hill) {
    if (t < 0.22) return 'snow-hills';
    return t > 0.7 && m < 0.3 ? 'badlands' : 'hills';
  }
  if (cold) {
    if (t < 0.06) return 'glacier';
    return m > 0.45 ? 'taiga' : 'snow';
  }
  if (m > 0.72 && e < Math.max(lines.sea, 0) + 0.1) return 'swamp';
  if (t > 0.68) return m < 0.38 ? 'desert' : m > 0.62 ? 'jungle' : 'savanna';
  return m > 0.56 ? 'forest' : 'grass';
}

/**
 * @typedef {{
 *   size: number,
 *   elevation: Float64Array,
 *   biomes: string[],
 *   cells: string[],
 *   lines: ElevationLines,
 * }} TerrainField
 * `biomes` is the biome per cell and `cells` is the terrain class per
 * cell, both indexed `y * size + x`.
 */

/**
 * Build the climate fields for a square map and classify every cell.
 * @param {number} size side length in tiles
 * @param {TerrainProfile} profile
 * @param {() => number} rng
 * @returns {TerrainField}
 */
export function terrainField(size, profile, rng) {
  const elevNoise = valueNoise(rng);
  const moistNoise = valueNoise(rng);
  const heatNoise = valueNoise(rng);
  // Each map varies a little around its profile, so two temperate maps
  // do not share one climate.
  const warmth = profile.warmth + (rng() - 0.5) * 0.16;
  const wetness = profile.wetness + (rng() - 0.5) * 0.16;
  // Noise features scale with the map: a large map gets more hills and
  // lakes, not larger ones. A small map still gets a few features.
  const features = Math.max(2.5, size / 9);
  const unit = features / size;
  const half = size / 2;
  const n = size * size;
  const elevation = new Float64Array(n);
  const moisture = new Float64Array(n);
  const heat = new Float64Array(n);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      let e = fbm(elevNoise, x * unit, y * unit);
      if (profile.falloff) {
        // The squared distance uses exact arithmetic only. Math.hypot can
        // round in a different way in each browser engine, and then one seed
        // gives a different map in each browser.
        const dx = x + 0.5 - half;
        const dy = y + 0.5 - half;
        e -= (profile.falloff * (dx * dx + dy * dy) * 0.6) / (half * half);
      }
      elevation[i] = e;
      moisture[i] = fbm(moistNoise, x * unit, y * unit, 3);
      heat[i] = fbm(heatNoise, x * unit, y * unit, 2);
    }
  }
  stretch(elevation);
  stretch(moisture);
  stretch(heat);
  if (profile.shore) {
    // A sea-bound map drops its border below every other cell, so the
    // quantile lines put the whole border under water.
    for (let i = 0; i < n; i++) {
      const x = i % size;
      const y = Math.floor(i / size);
      if (x === 0 || y === 0 || x === size - 1 || y === size - 1) elevation[i] = -1;
    }
  }
  // On a small sea-bound map the border alone can be more than the water
  // fraction. Sea level then stays above the lowered border, so the border
  // is still water.
  const sea = quantile(elevation, profile.water);
  const lines = {
    deep: quantile(elevation, profile.water * 0.45),
    sea: profile.shore ? Math.max(sea, -0.5) : sea,
    hill: quantile(elevation, 1 - profile.hills - profile.mountain),
    mountain: quantile(elevation, 1 - profile.mountain),
  };
  /** @type {string[]} */
  const biomes = new Array(n);
  for (let i = 0; i < n; i++) {
    const y = Math.floor(i / size);
    const e = elevation[i];
    const m = moisture[i] + (wetness - 0.5) * 0.8;
    const cooling = Math.max(0, e - lines.hill) * 0.5;
    const t =
      warmth + (heat[i] - 0.5) * 0.3 + profile.latitude * ((y + 0.5) / size - 0.5) * 0.8 - cooling;
    biomes[i] = classifyBiome(e, m, t, lines);
  }
  return { size, elevation, biomes, cells: biomes.map((b) => BIOME_TERRAIN[b]), lines };
}
