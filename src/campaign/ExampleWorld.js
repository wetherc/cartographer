import { createMapNode, TileGrid } from '../map/TileGrid.js';
import { generateNodeTiles } from '../map/MapGenerator.js';
import { childSeed } from '../map/GeneratorTree.js';
import { withNodeTiles } from '../map/TileIndex.js';
import { mulberry32 } from '../util/Rng.js';
import { IdPool, expandSites, noteTile } from './ExampleStaging.js';
import { REGION_STAGES } from './ExampleRegions.js';

/** @typedef {import('../map/TilePalette.js').TilePalette} TilePalette */
/** @typedef {import('../types/map.js').Tile} Tile */
/** @typedef {import('../map/MapGenerator.js').GeneratedMap} GeneratedMap */
/** @typedef {import('../map/GeneratorTree.js').TreeNode} TreeNode */
/** @typedef {import('./ExampleStaging.js').SiteOverride} SiteOverride */

/**
 * A spot on the map where the story puts something: a creature, the party,
 * or a handout.
 * @typedef {{ nodeId: string, tileId: string }} Place
 */

/**
 * The example world's maps and the places the story content stands on.
 * `places` is keyed by a story name, such as `snagtooth` or `start`.
 * @typedef {{ grid: TileGrid, places: Record<string, Place> }} ExampleWorld
 */

/**
 * The seed of the example world. Every map below the world takes its seed
 * from this one through `GeneratorTree.childSeed`, so the whole campaign,
 * down to the furnishings of each building, is the same on every load, and
 * the hand edits below land on known cells. A change to a generator can
 * move the regions of this seed. The tests then fail on the anchors of
 * `REGIONS`, and the anchors, the docs, and the screenshots need a new pass.
 */
export const WORLD_SEED = 145;

/**
 * The regions of the example world. The generator splits the continent
 * into nine regions and chooses the climate of each from its terrain. Each
 * entry names the region whose block covers `anchor`, a cell on the world
 * map, and puts the GM note on that cell. The story of each region comes
 * from `ExampleRegions.REGION_STAGES`.
 * @type {{ anchor: string, id: string, name: string, notes: string }[]}
 */
export const REGIONS = [
  {
    anchor: '12,30',
    id: 'briarwick-vale',
    name: 'Briarwick Vale',
    notes:
      'Farmland and the south road. Briarwick is the market town, and the goblin raids have burned its outlying farms.',
  },
  {
    anchor: '5,15',
    id: 'saltreach',
    name: 'The Saltreach',
    notes:
      'Wooded coast west of the highlands. Saltmere is its port, and the drowned dead walk its shallows.',
  },
  {
    anchor: '9,8',
    id: 'northmarch',
    name: 'The Northmarch',
    notes:
      'Old forest in the north-west. Snagtooth camps here, and the Wardstone Circle stands in the north.',
  },
  {
    anchor: '30,4',
    id: 'rimewold',
    name: 'The Rimewold',
    notes: 'Snowfields and taiga in the far north. Winter wolves hunt the passes.',
  },
  {
    anchor: '25,20',
    id: 'graypeak',
    name: 'Graypeak Highlands',
    notes:
      'The mountain heart of the Marches. Skalvyr nests here, Odo keeps his hermitage, and the Hollowvein mine goes deep.',
  },
  {
    anchor: '40,16',
    id: 'eastmarch',
    name: 'The Eastmarch',
    notes: 'Open grassland in the east. Dorn’s caravan came west from here with its sealed crates.',
  },
  {
    anchor: '25,36',
    id: 'barrowdowns',
    name: 'The Barrowdowns',
    notes:
      'Hills south of the peaks. Thornhold, the seat of House Vane, keeps watch over the Barrow of the Old King.',
  },
  {
    anchor: '40,33',
    id: 'mirefen',
    name: 'The Mirefen',
    notes: 'Marsh and drowned woods in the south-east. Grelka the mire hag lives at its heart.',
  },
  {
    anchor: '17,43',
    id: 'ashen-reach',
    name: 'The Ashen Reach',
    notes:
      'Desert at the southern tip. The ruins of the Silver Road, where Ostrand’s tithe caravans died, lie in the sand.',
  },
];

/** The region the party starts in. Its block on the world map starts revealed. */
const START_REGION = 'briarwick-vale';

/**
 * The name of the key item that opens the barrow. Odo gives the warding key,
 * or Sella recasts the counter-key into one, and the GM then adds an item of
 * this name to the inventory of the character who takes it.
 */
export const WARDING_KEY = 'Warding Key';

/**
 * The locks of the example maps, by node id. A locked map stops the party at
 * the way in until a character carries the key item or the GM unlocks it.
 * @type {Record<string, import('../types/map.js').NodeLock>}
 */
const LOCKS = { barrow: { requires: WARDING_KEY, open: false } };

/**
 * One region's plan for its story, filled by a stage function of
 * `ExampleRegions.js`. `overrides` gives the fixed id and choices of each
 * story site, keyed by site index. `places` collects the spots on the
 * region map. `after` runs once every sub-map exists, to put people inside
 * the sub-maps.
 * @typedef {{
 *   regionId: string,
 *   gen: GeneratedMap,
 *   palette: TilePalette,
 *   overrides: Map<number, SiteOverride>,
 *   places: Record<string, Place>,
 *   after: ((node: (id: string) => TreeNode) => void)[],
 * }} RegionStage
 */

/**
 * Build the example campaign's maps: the generated world with its nine
 * regions, each region with its towns, keeps, dungeons, and caves, and the
 * buildings of the two story towns. The story places come from the stage
 * functions of `ExampleRegions.js`. Content that populates the places lives
 * in ExampleContent.js.
 * @param {TilePalette} palette
 * @returns {ExampleWorld}
 */
export function buildExampleWorld(palette) {
  const world = generateNodeTiles(
    palette,
    { archetype: 'world', size: 'vast' },
    mulberry32(WORLD_SEED),
  );
  const ids = new IdPool();
  ids.take('world');
  /** @type {Record<string, Place>} */
  const places = {};
  /** @type {TreeNode[]} */
  const nodes = [];

  world.sites.forEach((site, i) => {
    const region = REGIONS.find((r) => site.tileIds.includes(r.anchor));
    if (!region) throw new Error(`World region ${i} has no entry in REGIONS.`);
    const id = ids.take(region.id);
    const tiles = new Set(site.tileIds);
    world.tiles = world.tiles.map((t) =>
      tiles.has(t.id) ? { ...t, childNodeId: id, revealed: region.id === START_REGION } : t,
    );
    noteTile(world, region.anchor, region.notes);

    const seed = childSeed(WORLD_SEED, i);
    const gen = generateNodeTiles(
      palette,
      { archetype: site.archetype, size: site.size, environ: site.environ, guide: site.guide },
      mulberry32(seed),
    );
    /** @type {RegionStage} */
    const stage = { regionId: id, gen, palette, overrides: new Map(), places, after: [] };
    REGION_STAGES[id]?.(stage);
    const below = expandSites(palette, { id, gen, seed }, stage.overrides, ids);
    const top = {
      id,
      parentId: 'world',
      name: region.name,
      kind: site.kind,
      environ: site.environ,
      width: gen.width,
      height: gen.height,
      tiles: gen.tiles,
      entry: gen.entry,
    };
    nodes.push(top, ...below.nodes);
    const byId = new Map([top, ...below.nodes].map((n) => [n.id, n]));
    for (const fn of stage.after) {
      fn((nodeId) => {
        const node = byId.get(nodeId);
        if (!node) throw new Error(`The example has no node ${nodeId}.`);
        return node;
      });
    }
  });
  for (const region of REGIONS) {
    if (!nodes.some((n) => n.id === region.id)) {
      throw new Error(`No world region covers the anchor of ${region.id}.`);
    }
  }

  const grid = new TileGrid();
  grid.addNode(
    withNodeTiles(
      createMapNode('world', 'The Marches', null, world.width, world.height),
      world.tiles,
    ),
  );
  for (const { id, name, parentId, width, height, kind, environ, tiles } of nodes) {
    const node = createMapNode(id, name, parentId, width, height, { kind, environ });
    const lock = LOCKS[id];
    grid.addNode(withNodeTiles(lock ? { ...node, lock: { ...lock } } : node, tiles));
  }
  return { grid, places };
}
