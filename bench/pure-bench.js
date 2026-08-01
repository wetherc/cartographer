/**
 * Timings for the pure modules, with no browser involved.
 *
 * These are the paths that run inside a GM action and have no DOM in them:
 * generation, serialization, fog reveal, the world tree, the palette. A
 * regression here shows as a slower stroke or a slower save in the browser
 * run, but it is far cheaper to find at this level.
 *
 * Usage:
 *   pnpm bench:pure
 *   node --cpu-prof --cpu-prof-dir=bench/results bench/pure-bench.js
 *
 * The second form writes a `.cpuprofile` that opens in the DevTools
 * Performance panel, the same as the browser run's profiles.
 */

import { TilePalette } from '../src/map/TilePalette.js';
import { generateNodeTiles } from '../src/map/MapGenerator.js';
import { createMapNode } from '../src/map/TileGrid.js';
import { withNodeTiles } from '../src/map/TileIndex.js';
import { revealAround, revealedCount } from '../src/map/FogOfWar.js';
import { buildWorldTree } from '../src/map/WorldTree.js';
import { buildExampleCampaign } from '../src/campaign/Campaigns.js';
import { buildState, serialize, deserialize } from '../src/storage/SaveManager.js';
import { mulberry32 } from '../src/util/Rng.js';

/**
 * Time a function over several rounds and report the median and the worst
 * round. The median resists one slow round from a collection. The worst round
 * is what a GM feels.
 * @param {string} name
 * @param {() => unknown} fn
 * @param {number} rounds
 */
function measure(name, fn, rounds = 20) {
  fn(); // one warm round, so the report excludes first-call compilation
  const times = [];
  for (let i = 0; i < rounds; i++) {
    const started = performance.now();
    fn();
    times.push(performance.now() - started);
  }
  times.sort((a, b) => a - b);
  return {
    name,
    rounds,
    medianMs: Number(times[Math.floor(rounds / 2)].toFixed(3)),
    worstMs: Number(times[rounds - 1].toFixed(3)),
  };
}

const palette = new TilePalette();

/** A filled node of the given size, for the fog and tree cases. */
function filledNode(size) {
  const gen = generateNodeTiles(palette, { archetype: 'wilderness', size }, mulberry32(7));
  const node = createMapNode('bench', 'Bench', null, gen.width, gen.height);
  return withNodeTiles(node, gen.tiles);
}

const example = buildExampleCampaign(palette, mulberry32(1));
const exampleState = buildState(example);
const exampleJson = serialize(exampleState);
const large = filledNode('large');
const nodes = [...example.grid.nodes.values()];

const cases = [
  measure('generateNodeTiles small', () =>
    generateNodeTiles(palette, { archetype: 'wilderness', size: 'small' }, mulberry32(1)),
  ),
  measure('generateNodeTiles large', () =>
    generateNodeTiles(palette, { archetype: 'wilderness', size: 'large' }, mulberry32(1)),
  ),
  measure('generateNodeTiles town large', () =>
    generateNodeTiles(palette, { archetype: 'town', size: 'large' }, mulberry32(1)),
  ),
  measure('buildExampleCampaign', () => buildExampleCampaign(palette, mulberry32(1)), 5),
  measure('buildState + serialize', () => serialize(buildState(example)), 10),
  measure('deserialize', () => deserialize(exampleJson, {}), 10),
  measure('revealAround radius 3', () => revealAround(large, large.tiles[40].id, 3), 200),
  measure('revealedCount', () => revealedCount(large), 200),
  measure('buildWorldTree', () => buildWorldTree(nodes), 200),
  measure('palette.listVariants grass', () => palette.listVariants('grass'), 500),
];

const width = Math.max(...cases.map((c) => c.name.length));
process.stdout.write(`save size: ${(exampleJson.length / 1024).toFixed(1)} KB\n`);
process.stdout.write(`example nodes: ${nodes.length}\n\n`);
process.stdout.write(`${'case'.padEnd(width)}  median      worst    rounds\n`);
for (const c of cases) {
  process.stdout.write(
    `${c.name.padEnd(width)}  ${`${c.medianMs} ms`.padStart(9)}  ${`${c.worstMs} ms`.padStart(9)}  ${String(c.rounds).padStart(6)}\n`,
  );
}
