import { shuffle } from './GeneratorRandom.js';

/**
 * Seeded 2D value noise for the terrain generators. A lattice of random
 * values sits on the integer grid, and a point between lattice corners
 * blends the four corner values with a smoothstep curve. The result is a
 * smooth field with no visible grid pattern, so neighboring tiles get similar
 * values and terrain forms contiguous features.
 *
 * The injected RNG fills the lattice. The same seed then gives the same
 * field, which keeps a generated map reproducible from its seed.
 */

/** Lattice period. Coordinates wrap at this value, far beyond any map. */
const PERIOD = 256;

/** @param {number} t */
const smooth = (t) => t * t * (3 - 2 * t);

/** @param {number} a @param {number} b @param {number} t */
const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Build one value-noise field. The returned function takes a point in
 * lattice units and returns a value in [0, 1).
 * @param {() => number} rng
 * @returns {(x: number, y: number) => number}
 */
export function valueNoise(rng) {
  const values = Array.from({ length: PERIOD }, () => rng());
  const perm = shuffle(
    Array.from({ length: PERIOD }, (_, i) => i),
    rng,
  );
  /** @param {number} i @param {number} j */
  const at = (i, j) => values[perm[(perm[i & (PERIOD - 1)] + j) & (PERIOD - 1)]];
  return (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const u = smooth(x - xi);
    const v = smooth(y - yi);
    const top = lerp(at(xi, yi), at(xi + 1, yi), u);
    const bottom = lerp(at(xi, yi + 1), at(xi + 1, yi + 1), u);
    return lerp(top, bottom, v);
  };
}

/**
 * Fractal noise: several octaves of one field summed, each at twice the
 * frequency and half the weight of the one before. Large octaves give
 * continents and ranges, and small ones break up their edges. The sum is
 * divided by the total weight, so the result stays in [0, 1).
 * @param {(x: number, y: number) => number} noise
 * @param {number} x @param {number} y
 * @param {number} [octaves]
 * @returns {number}
 */
export function fbm(noise, x, y, octaves = 4) {
  let sum = 0;
  let weight = 0;
  let amp = 1;
  let freq = 1;
  for (let o = 0; o < octaves; o++) {
    // Each octave samples a shifted region of the lattice, so the octaves
    // do not share lattice corners and stack into visible peaks.
    sum += amp * noise(x * freq + o * 17.3, y * freq + o * 31.7);
    weight += amp;
    amp /= 2;
    freq *= 2;
  }
  return sum / weight;
}

/**
 * Rescale a field in place so its lowest value becomes 0 and its highest
 * becomes 1. Fractal noise clusters near the middle of its range, so fixed
 * biome thresholds would give most maps one biome. A stretched field uses the
 * whole range on every map. A flat field becomes all zeros.
 * @param {Float64Array} field
 * @returns {Float64Array} the same array
 */
export function stretch(field) {
  let min = Infinity;
  let max = -Infinity;
  for (const v of field) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const span = max - min;
  for (let i = 0; i < field.length; i++) field[i] = span > 0 ? (field[i] - min) / span : 0;
  return field;
}

/**
 * The value below which `fraction` of the field lies. The terrain generator
 * sets sea level and the hill and mountain lines this way, so a profile that
 * asks for 12% water gets close to 12% on every seed, whatever the noise
 * looks like.
 * @param {Float64Array} field
 * @param {number} fraction in [0, 1]
 * @returns {number}
 */
export function quantile(field, fraction) {
  const sorted = Float64Array.from(field).sort();
  const i = Math.floor(fraction * sorted.length);
  if (i <= 0) return -Infinity;
  if (i >= sorted.length) return Infinity;
  return sorted[i];
}
