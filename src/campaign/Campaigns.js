import { createMapNode, createTile, setTile, TileGrid } from '../map/TileGrid.js';
import { generateNodeTiles } from '../map/MapGenerator.js';
import { coastOverlays, smoothCoastline } from '../map/Autotile.js';
import { createCharacter, withDefaults, withHP } from '../entities/Character.js';
import { withSpellSlots } from '../entities/SpellSlots.js';
import {
  createEncounter,
  withDefaults as withEncounterDefaults,
} from '../entities/Encounter.js';
import { loadFromLocalStorage, toTileGrid } from '../storage/SaveManager.js';
import { createClock } from '../time/GameClock.js';
import { withDefaults as withNPCDefaults } from '../entities/NPC.js';
import { defaultEnemyStats } from '../entities/Modifiers.js';
import { withDefaults as withHandoutDefaults } from '../handout/Handouts.js';

/** @typedef {import('../map/TilePalette.js').TilePalette} TilePalette */

/**
 * Everything that makes up one campaign's state, as the app works with it at
 * runtime (SaveManager's CampaignState is the serialized counterpart).
 * @typedef {{
 *   grid: TileGrid,
 *   party: import('../types/map.js').PartyPosition,
 *   characters: import('../types/entities.js').Character[],
 *   encounters: import('../types/entities.js').Encounter[],
 *   travelog: import('../types/log.js').LogEntry[],
 *   quests: import('../types/quest.js').Quest[],
 *   clock: import('../types/time.js').GameClock,
 *   npcs: import('../types/npc.js').NPC[],
 *   handouts: import('../types/handout.js').Handout[],
 *   bestiary: import('../types/entities.js').EncounterTemplate[],
 *   splitParty: boolean,
 * }} Campaign
 */

/**
 * A genuinely blank campaign: one empty world node to author into, nobody in
 * the party, nothing to fight. This is what a first run and the "New" button
 * produce, so demo content only ever appears when explicitly asked for.
 * @returns {Campaign}
 */
export function buildBlankCampaign() {
  const grid = new TileGrid();
  grid.addNode(createMapNode('world', 'World', null, 8, 6));
  return {
    grid,
    party: { nodeId: 'world', tileId: '0,0' },
    characters: [],
    encounters: [],
    travelog: [],
    quests: [],
    clock: createClock(),
    npcs: [],
    handouts: [],
    bestiary: [],
    splitParty: false,
  };
}

/** The example overworld is a WORLD_SIZE x WORLD_SIZE grid. */
const WORLD_SIZE = 32;

/**
 * Terrain type for an example-world cell, from hand-shaped features rather
 * than noise so the demo map always has the same recognizable geography: an
 * ocean along the west edge, a broad forest across the north, snowfields over
 * the northeastern peaks, a mountain range down the east edge with foothills
 * below it, a lake in the southwest, farmland around Briarwick, a marsh in
 * the southern lowlands, and badlands in the far southeast corner, on a
 * grass base.
 * @param {number} x @param {number} y
 * @returns {string}
 */
function exampleTerrain(x, y) {
  if (x <= 1) return 'water';
  if (y <= 5 && x >= 24) return 'snow';
  if (y <= 8 && x <= 20 && (y <= 6 || x >= 3)) return 'forest';
  if (x >= 26 && y <= 20) return 'mountain';
  if (x >= 21 && x <= 25 && y >= 9 && y <= 15) return 'hills';
  if (((x - 6) / 4) ** 2 + ((y - 24) / 3) ** 2 <= 1) return 'water';
  if (x >= 8 && x <= 15 && y >= 19 && y <= 22) return 'farmland';
  if (y >= 27 && x >= 13 && x <= 22) return 'swamp';
  if (x >= 25 && y >= 27) return 'desert';
  return 'grass';
}

/** The example world's river runs south down this column, then bends west. */
const RIVER_X = 19;
/** The row the river follows west from its bend to drain into the lake. */
const RIVER_BEND_Y = 25;

/**
 * A small example world, loadable on demand via the "Load example" button:
 * a 32x32 overworld with a crossroads, three outdoor subregions (the forested
 * Northmarch, the Graypeak Highlands, and the town of Briarwick) plus a
 * dungeon interior, each entered through a linked block or marker tile.
 * @param {TilePalette} palette
 * @returns {Campaign}
 */
export function buildExampleCampaign(palette) {
  const rng = () => Math.random();
  const grid = new TileGrid();

  // Linked entrance blocks on the overworld: 4x4 for the two wilderness
  // regions (rendered as four scaled 2x2 images), 2x2 for Briarwick, and a
  // single marker tile for the dungeon interior. Each block sits inside
  // matching terrain so the overview hints at what's inside, and Briarwick's
  // block carries a settlement POI marker so the scaled block art reads as a
  // town.
  /** @type {Record<string, { nodeId: string, poi?: { tileId: string, imageId: string, poiType: import('../types/map.js').POIType } }>} */
  const links = {};
  for (let y = 2; y <= 5; y++) for (let x = 4; x <= 7; x++) links[`${x},${y}`] = { nodeId: 'northmarch' };
  for (let y = 7; y <= 10; y++) for (let x = 26; x <= 29; x++) links[`${x},${y}`] = { nodeId: 'graypeak' };
  for (const [x, y] of [[11, 23], [12, 23], [11, 24], [12, 24]]) links[`${x},${y}`] = { nodeId: 'briarwick' };
  links['12,23'].poi = { tileId: '12,23', imageId: 'settlement', poiType: 'settlement' };
  links['22,10'] = { nodeId: 'barrow', poi: { tileId: '22,10', imageId: 'dungeon', poiType: 'dungeon' } };

  // Shape the terrain first so the coastline helpers can widen the water and
  // pick shoreline overlays before any tiles are stamped.
  /** @type {string[]} */
  const cells = [];
  for (let y = 0; y < WORLD_SIZE; y++) {
    for (let x = 0; x < WORLD_SIZE; x++) cells.push(exampleTerrain(x, y));
  }
  const smoothed = smoothCoastline(cells, WORLD_SIZE, WORLD_SIZE);
  const coast = coastOverlays(smoothed, WORLD_SIZE, WORLD_SIZE);
  /** @param {number} x @param {number} y */
  const terrainAt = (x, y) => smoothed[y * WORLD_SIZE + x];

  let world = createMapNode('world', 'World', null, WORLD_SIZE, WORLD_SIZE);
  const last = WORLD_SIZE - 1;
  for (let y = 0; y < WORLD_SIZE; y++) {
    for (let x = 0; x < WORLD_SIZE; x++) {
      const id = `${x},${y}`;
      const link = links[id];

      // Roads and the river run as overlays over the terrain base, so they
      // read as features laid on the land rather than replacing it. end-*
      // names the tile's open edge: the westmost road tile connects to the
      // road on its east, so it takes end-e (and vice versa at the far edge).
      // An east-west road crosses the map at y=16, starting past the ocean
      // shore; a branch at x=12 tees off south to end just above Briarwick's
      // block. The river flows from the north edge, under the highway on a
      // bridge, then bends west below Briarwick to drain into the lake — its
      // mouth tile stacks the channel over the shoreline overlay.
      const onHighway = y === 16 && x >= 3;
      const onBranch = x === 12 && y > 16 && y <= 22;
      const onRiver = (x === RIVER_X && y <= RIVER_BEND_Y) || (y === RIVER_BEND_Y && x >= 10 && x < RIVER_X);
      if (!link && (onHighway || onBranch || onRiver)) {
        const overlay = onRiver
          ? palette.getRiverPiece(x === RIVER_X ? (y === 16 ? 'bridge-h' : y === RIVER_BEND_Y ? 'corner-nw' : 'v') : 'h')
          : onHighway
            ? palette.getRoadPiece(x === 3 ? 'end-e' : x === last ? 'end-w' : x === 12 ? 'tee-s' : 'h')
            : palette.getRoadPiece(y === 22 ? 'end-n' : 'v');
        if (!overlay) continue;
        const shoreline = coast.get(id);
        const shore = shoreline ? palette.getCoastPiece(shoreline) : null;
        const refs = shore ? [shore.imageRef, overlay.imageRef] : overlay.imageRef;
        const base = palette.pickVariant(terrainAt(x, y), rng);
        world = setTile(world, createTile(id, base.imageRef, { overlayRef: refs }));
        continue;
      }

      if (link?.poi) {
        const marker = palette.get(link.poi.imageId);
        if (!marker) continue;
        const tile = createTile(id, marker.imageRef, { childNodeId: link.nodeId });
        tile.metadata = { ...tile.metadata, poiType: link.poi.poiType, discoverable: true };
        world = setTile(world, tile);
        continue;
      }

      const terrain = link ? { northmarch: 'forest', graypeak: 'mountain', briarwick: 'grass' }[link.nodeId] : terrainAt(x, y);
      /** @type {Partial<import('../types/map.js').Tile>} */
      const opts = link ? { childNodeId: link.nodeId } : {};
      const shoreline = !link && coast.get(id);
      if (shoreline) opts.overlayRef = palette.getCoastPiece(shoreline)?.imageRef ?? null;
      const entry = palette.pickVariant(terrain ?? 'grass', rng);
      world = setTile(world, createTile(id, entry.imageRef, opts));
    }
  }
  grid.addNode(world);

  // Subregion maps come from the same generators the Build tab's "Generate"
  // action uses, so the demo shows off representative generated content: two
  // wilderness regions, a road-and-buildings town, and a dungeon interior.
  const regions = [
    { id: 'northmarch', name: 'Northmarch Region', kind: /** @type {const} */ ('region'), archetype: 'wilderness' },
    { id: 'graypeak', name: 'Graypeak Highlands', kind: /** @type {const} */ ('region'), archetype: 'wilderness' },
    { id: 'briarwick', name: 'Briarwick', kind: /** @type {const} */ ('region'), archetype: 'town' },
    { id: 'barrow', name: 'Barrow of the Old King', kind: /** @type {const} */ ('interior'), archetype: 'dungeon' },
  ];
  for (const { id, name, kind, archetype } of regions) {
    const gen = generateNodeTiles(palette, { kind, archetype, size: 'medium' }, rng);
    const node = createMapNode(id, name, 'world', gen.width, gen.height, { kind });
    grid.addNode({ ...node, tiles: gen.tiles });
  }

  let hero = withHP(createCharacter('hero', 'Hero', { STR: 14, DEX: 12, CON: 13 }, 'Human'), 12);
  hero = withSpellSlots(hero);

  return {
    grid,
    party: { nodeId: 'world', tileId: '16,16' },
    characters: [hero],
    encounters: [
      createEncounter('goblin', 'Goblin', 7, defaultEnemyStats(1, 'mob'), { nodeId: 'world', tileId: '18,15' }),
    ],
    travelog: [],
    quests: [
      {
        id: 'reach-northmarch',
        title: 'Reach the Northmarch',
        notes: 'Follow the north road, then strike northwest through the forest to the Northmarch.',
        status: 'active',
      },
    ],
    clock: createClock(),
    npcs: [
      {
        id: 'innkeeper-bram',
        name: 'Bram',
        role: 'Innkeeper, the Waystation at Briarwick',
        disposition: 'friendly',
        notes: 'Knows the roads north and gossips freely for a warm meal.',
        stats: { STR: 10, DEX: 10, CON: 10, INT: 12, WIS: 14, CHA: 13 },
        location: { nodeId: 'world', tileId: '12,19' },
      },
    ],
    handouts: [
      {
        id: 'northmarch-rumor',
        title: 'A Rumor at the Waystation',
        body: 'They say the old forest road north hasn\'t been safe since the goblins came down from the hills. Travelers go in twos now, or not at all.',
        nodeId: 'world',
        revealed: false,
        image: null,
      },
    ],
    bestiary: [
      { id: 'goblin', name: 'Goblin', maxHP: 7, statBlock: { AC: 13, Speed: 30 }, level: 1, tier: 'mob' },
    ],
    splitParty: false,
  };
}

/**
 * The campaign the app boots with: the saved one if a save exists, otherwise a
 * blank campaign (the demo world is opt-in via "Load example", never a silent
 * default). Loaded entities are default-filled for back-compat with older
 * saves; an empty character roster is legitimate authored state, so no default
 * character is ever injected.
 * @returns {Campaign}
 */
export function loadInitialCampaign() {
  const saved = loadFromLocalStorage();
  if (!saved) return buildBlankCampaign();
  return {
    grid: toTileGrid(saved),
    party: saved.party ?? { nodeId: 'world', tileId: '0,0' },
    characters: saved.characters.map(withDefaults),
    encounters: saved.encounters.map(withEncounterDefaults),
    travelog: saved.travelog ?? [],
    quests: saved.quests ?? [],
    clock: saved.clock ?? createClock(),
    npcs: (saved.npcs ?? []).map(withNPCDefaults),
    handouts: (saved.handouts ?? []).map(withHandoutDefaults),
    bestiary: saved.bestiary ?? [],
    splitParty: saved.splitParty ?? false,
  };
}
