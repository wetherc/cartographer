/**
 * RNG helpers for the map generators. Each generator takes an injected
 * `() => number` RNG. Pass `Math.random` in the app and a seeded generator in
 * tests. A seed then reproduces the same generation exactly.
 */

/** @param {() => number} rng @param {number} n */
export function randInt(rng, n) {
  return Math.floor(rng() * n);
}

/**
 * Fisher-Yates shuffle of a copy of `items`. The injected RNG makes the order
 * reproducible from a seed. Town building placement uses this for a deterministic scatter.
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
