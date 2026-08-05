/**
 * Fast benchmark check for the pre-commit hook.
 *
 * The hook runs this script when a commit touches `src/`. The script times
 * the size-sensitive pure paths at one large world size. It compares each
 * median against a budget from `bench/budgets.json`. The table prints on
 * every run. A path over its budget gets an OVER mark and a warning block
 * at the end.
 *
 * The script exits with code 1 when any path is over budget. The hook
 * ignores that code, so a breach never blocks a commit. The exit code is
 * for other callers that want to fail on a breach.
 *
 * The budgets are wide on purpose. They sit well above the medians of a
 * healthy run, so machine speed and background noise do not trip them.
 * A breach means a code path does more work than before, not that the
 * machine was busy. When a deliberate change moves a cost, re-measure and update
 * `bench/budgets.json` in the same commit.
 *
 * Usage:
 *   pnpm bench:commit
 */

import { readFileSync } from 'node:fs';
import { TilePalette } from '../src/map/TilePalette.js';
import { generateNodeTiles } from '../src/map/MapGenerator.js';
import { createMapNode } from '../src/map/TileGrid.js';
import { withNodeTiles } from '../src/map/TileIndex.js';
import { revealAround } from '../src/map/FogOfWar.js';
import { buildWorldTree } from '../src/map/WorldTree.js';
import { buildExampleCampaign } from '../src/campaign/Campaigns.js';
import { buildState, serialize, deserialize, toTileGrid } from '../src/storage/SaveManager.js';
import { diffState } from '../src/storage/StateDiff.js';
import { reconcile } from '../src/storage/Reconcile.js';
import { encodeNodeTiles } from '../src/storage/TileCodec.js';
import { createCreature } from '../src/entities/Creature.js';
import { mulberry32 } from '../src/util/Rng.js';

/**
 * Time a function over several rounds and keep the median.
 * @param {() => unknown} fn
 * @param {number} rounds
 */
function medianMs(fn, rounds) {
  fn(); // one warm round, so the numbers exclude first-call compilation
  const times = [];
  for (let i = 0; i < rounds; i++) {
    const started = performance.now();
    fn();
    times.push(performance.now() - started);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(rounds / 2)];
}

/** The example campaign plus generated large regions and placed creatures. */
function scaledCampaign(extraNodes, extraCreatures) {
  const palette = new TilePalette();
  const rng = mulberry32(11);
  const campaign = buildExampleCampaign(palette, rng);
  const archetypes = ['wilderness', 'town', 'dungeon'];
  for (let i = 0; i < extraNodes; i++) {
    const archetype = archetypes[i % archetypes.length];
    const gen = generateNodeTiles(palette, { archetype, size: 'large' }, rng);
    const node = createMapNode(`region-${i}`, `Region ${i}`, 'world', gen.width, gen.height);
    campaign.grid.addNode(withNodeTiles(node, gen.tiles));
  }
  for (let i = 0; i < extraCreatures; i++) {
    campaign.creatures.push(
      createCreature(`crea-${i}`, `Creature ${i}`, {
        disposition: i % 3 ? 'hostile' : 'friendly',
        location: { nodeId: `region-${i % extraNodes}`, tileId: `${i % 40},${(i * 7) % 40}` },
      }),
    );
  }
  return campaign;
}

const budgetsPath = new URL('./budgets.json', import.meta.url);
const budgets = JSON.parse(readFileSync(budgetsPath, 'utf8'));

const campaign = scaledCampaign(budgets.extraNodes, budgets.extraCreatures);
const state = buildState(campaign);
const json = serialize(state);
const liveNodes = [...campaign.grid.nodes.values()];

// The diff runs against a one-node change: a fog reveal on the world node.
// The warm case shares identity with the unchanged entities, as every save
// after the first in a session does. The cold case shares nothing, as the
// first save after a reload does.
const worldNode = campaign.grid.getNode('world');
const revealed = revealAround(worldNode, '16,16', 3);
const after = {
  ...state,
  nodes: state.nodes.map((n) => (n.id === 'world' ? encodeNodeTiles(revealed) : n)),
};
const coldBefore = JSON.parse(JSON.stringify(state));

/** @type {Record<string, number>} */
const measured = {
  serialize: medianMs(() => serialize(buildState(campaign)), 3),
  deserialize: medianMs(() => deserialize(json), 3),
  toTileGrid: medianMs(() => toTileGrid(deserialize(json)), 3),
  reconcile: medianMs(
    () => reconcile(liveNodes, [...toTileGrid(deserialize(json)).nodes.values()]),
    3,
  ),
  diffWarm: medianMs(() => diffState(state, after), 3),
  diffCold: medianMs(() => diffState(coldBefore, after), 3),
  fogReveal: medianMs(() => revealAround(worldNode, '16,16', 3), 20),
  worldTree: medianMs(() => buildWorldTree(liveNodes), 20),
};

const over = [];
process.stdout.write(
  `bench: +${budgets.extraNodes} large regions, ${budgets.extraCreatures} creatures\n`,
);
for (const [name, budget] of Object.entries(budgets.budgetsMs)) {
  const ms = measured[name];
  const mark = ms > budget ? '  << OVER BUDGET' : '';
  if (ms > budget) over.push(name);
  process.stdout.write(
    `  ${name.padEnd(12)} ${ms.toFixed(1).padStart(7)} ms   budget ${String(budget).padStart(4)} ms${mark}\n`,
  );
}

if (over.length > 0) {
  process.stdout.write('\n');
  process.stdout.write('  !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n');
  process.stdout.write(`  !! PERFORMANCE OVER BUDGET: ${over.join(', ')}\n`);
  process.stdout.write('  !! The commit proceeds. Look at the change before you push.\n');
  process.stdout.write('  !! A deliberate cost move also updates bench/budgets.json.\n');
  process.stdout.write('  !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n');
  process.exit(1);
}
