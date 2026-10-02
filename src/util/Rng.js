/**
 * This module generates seeded pseudo-random numbers, so a generated map is
 * reproducible from its seed. The app passes `mulberry32(seed)` wherever code
 * injects a `() => number` RNG. Tests use the same function for deterministic
 * fixtures.
 */

/**
 * mulberry32: a small, fast 32-bit PRNG that returns values in [0, 1). The
 * same seed always produces the same sequence.
 * @param {number} seed
 * @returns {() => number}
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generate a fresh random seed. The seed size keeps it a readable integer in
 * a form field.
 * @returns {number}
 */
export function randomSeed() {
  return Math.floor(Math.random() * 1e9);
}
