/**
 * RNG helpers shared by the map generators. Every generator takes an injected
 * `() => number` RNG (pass `Math.random` in the app, a seeded generator in
 * tests) so a seed reproduces a generation exactly.
 */

/** @param {() => number} rng @param {number} n */
export function randInt(rng, n) {
  return Math.floor(rng() * n);
}

/**
 * Fisher-Yates shuffle of a copy of `items`, using the injected RNG so a seed
 * reproduces the same order (used to scatter town buildings deterministically).
 * @template T @param {T[]} items @param {() => number} rng @returns {T[]}
 */
export function shuffle(items, rng) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randInt(rng, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
