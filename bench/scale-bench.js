/**
 * Timings for the size-sensitive pure paths as the world grows.
 *
 * `pure-bench.js` answers "how fast is each path on the example campaign".
 * This file answers a different question: which paths grow with the world,
 * and where a large campaign first crosses the 50 ms line that a GM feels
 * as a stall. Each step adds generated 40x40 nodes and placed creatures to
 * the example campaign, then times the whole-state paths: the autosave unit,
 * the load path, the cross-tab reconcile, and the undo diff. Fog reveal and
 * the world tree run too, as the control group that should stay flat.
 *
 * Usage:
 *   pnpm bench:scale
 *   node --cpu-prof --cpu-prof-dir=bench/results bench/scale-bench.js
 */

import { TilePalette } from '../src/map/TilePalette.js';
import { generateNodeTiles } from '../src/map/MapGenerator.js';
import { createMapNode } from '../src/map/TileGrid.js';
import { withNodeTiles } from '../src/map/TileIndex.js';
import { revealAround } from '../src/map/FogOfWar.js';
import { buildWorldTree } from '../src/map/WorldTree.js';
import { buildExampleCampaign } from '../src/campaign/Campaigns.js';
import {
  buildState,
  serialize,
  deserialize,
  toTileGrid,
  saveByteSize,
  isNearQuota,
} from '../src/storage/SaveManager.js';
import { diffState } from '../src/storage/StateDiff.js';
import { reconcile } from '../src/storage/Reconcile.js';
import { encodeNodeTiles } from '../src/storage/TileCodec.js';
import { createCreature } from '../src/entities/Creature.js';
import { mulberry32 } from '../src/util/Rng.js';

/**
 * Time a function over several rounds and keep the median. A scaling table
 * compares one column across rows, so the median is the number to trust.
 * @param {() => unknown} fn
 * @param {number} rounds
 */
function medianMs(fn, rounds) {
  fn(); // one warm round, so the report excludes first-call compilation
  const times = [];
  for (let i = 0; i < rounds; i++) {
    const started = performance.now();
    fn();
    times.push(performance.now() - started);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(rounds / 2)];
}

const palette = new TilePalette();

/**
 * The example campaign plus `extraNodes` generated large regions and
 * `extraCreatures` placed creatures. Archetypes rotate so the tile mix
 * stays representative, and every region hangs off the world node.
 * @param {number} extraNodes
 * @param {number} extraCreatures
 */
function scaledCampaign(extraNodes, extraCreatures) {
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
    const nodeId = extraNodes ? `region-${i % extraNodes}` : 'world';
    campaign.creatures.push(
      createCreature(`crea-${i}`, `Creature ${i}`, {
        disposition: i % 3 ? 'hostile' : 'friendly',
        location: { nodeId, tileId: `${i % 40},${(i * 7) % 40}` },
      }),
    );
  }
  return campaign;
}

const steps = [
  { label: 'example (7 nodes)', nodes: 0, creatures: 0 },
  { label: '+25 nodes, 150 creatures', nodes: 25, creatures: 150 },
  { label: '+50 nodes, 300 creatures', nodes: 50, creatures: 300 },
  { label: '+100 nodes, 600 creatures', nodes: 100, creatures: 600 },
  { label: '+200 nodes, 1200 creatures', nodes: 200, creatures: 1200 },
];

const header =
  'world'.padEnd(28) +
  'saveKB'.padStart(8) +
  'ser ms'.padStart(9) +
  'deser ms'.padStart(10) +
  'grid ms'.padStart(9) +
  'recon ms'.padStart(10) +
  'diffW ms'.padStart(10) +
  'diffC ms'.padStart(10) +
  'fog ms'.padStart(8) +
  'tree ms'.padStart(9);
process.stdout.write(`${header}\n`);

for (const step of steps) {
  const campaign = scaledCampaign(step.nodes, step.creatures);
  const state = buildState(campaign);
  const json = serialize(state);
  const liveNodes = [...campaign.grid.nodes.values()];

  // The undo diff runs against a one-node change: a fog reveal on the world
  // node. The interesting number is how the cost of that small change grows
  // with everything that did not change. The warm case is every save after
  // the first in a session: the unchanged entities share identity, because
  // the history keeps the live state as its snapshot. The cold case is the
  // first save after a reload, where nothing shares identity.
  const worldNode = campaign.grid.getNode('world');
  const revealed = revealAround(worldNode, '16,16', 3);
  const after = {
    ...state,
    nodes: state.nodes.map((n) => (n.id === 'world' ? encodeNodeTiles(revealed) : n)),
  };
  const coldBefore = JSON.parse(JSON.stringify(state));

  const row = {
    ser: medianMs(() => serialize(buildState(campaign)), 7),
    deser: medianMs(() => deserialize(json), 7),
    grid: medianMs(() => toTileGrid(deserialize(json)), 5),
    recon: medianMs(
      () => reconcile(liveNodes, [...toTileGrid(deserialize(json)).nodes.values()]),
      5,
    ),
    diffWarm: medianMs(() => diffState(state, after), 7),
    diffCold: medianMs(() => diffState(coldBefore, after), 7),
    fog: medianMs(() => revealAround(worldNode, '16,16', 3), 50),
    tree: medianMs(() => buildWorldTree(liveNodes), 50),
  };

  const bytes = saveByteSize(json);
  const cells =
    step.label.padEnd(28) +
    (bytes / 1024).toFixed(0).padStart(8) +
    row.ser.toFixed(1).padStart(9) +
    row.deser.toFixed(1).padStart(10) +
    row.grid.toFixed(1).padStart(9) +
    row.recon.toFixed(1).padStart(10) +
    row.diffWarm.toFixed(1).padStart(10) +
    row.diffCold.toFixed(1).padStart(10) +
    row.fog.toFixed(2).padStart(8) +
    row.tree.toFixed(2).padStart(9);
  process.stdout.write(`${cells}\n`);
  if (isNearQuota(bytes)) {
    process.stdout.write('  ^ past QUOTA_WARN_BYTES: the app shows the quota warning here\n');
  }
}
