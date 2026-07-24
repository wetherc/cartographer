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
import { createNPC, withDefaults as withNPCDefaults } from '../entities/NPC.js';
import { defaultEnemyStats } from '../entities/Modifiers.js';
import { withDefaults as withHandoutDefaults } from '../handout/Handouts.js';

/** @typedef {import('../map/TilePalette.js').TilePalette} TilePalette */
/** @typedef {import('../types/map.js').Tile} Tile */
/** @typedef {import('../types/entities.js').EnemyTier} EnemyTier */

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

/** @param {string} id @returns {[number, number]} */
function tileXY(id) {
  const [x, y] = id.split(',').map(Number);
  return [x, y];
}

/**
 * Manhattan distance between two tile ids.
 * @param {string} a @param {string} b
 * @returns {number}
 */
function tileDistance(a, b) {
  const [ax, ay] = tileXY(a);
  const [bx, by] = tileXY(b);
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

/**
 * A picker for staging story content on a generated map: each call returns
 * the unused candidate tile farthest from the node's entry (keeping at least
 * `gap` tiles between picks while possible), so bosses and landmarks land
 * deep in the layout rather than at the door. Falls back to the entry tile
 * only when a degenerate layout has no candidates at all.
 * @param {{ tiles: Tile[], entry: string }} gen
 * @param {(tile: Tile) => boolean} ok
 * @param {number} [gap]
 * @returns {() => string}
 */
function makeSpotPicker(gen, ok, gap = 3) {
  const candidates = gen.tiles
    .filter(ok)
    .map((t) => t.id)
    .sort((a, b) => tileDistance(b, gen.entry) - tileDistance(a, gen.entry));
  /** @type {string[]} */
  const used = [];
  return () => {
    const spaced = candidates.find(
      (id) => !used.includes(id) && used.every((u) => tileDistance(u, id) >= gap),
    );
    const next = spaced ?? candidates.find((id) => !used.includes(id)) ?? gen.entry;
    used.push(next);
    return next;
  };
}

/**
 * Open wilderness ground: bare grass or forest with no overlay and no marker,
 * so stamped story landmarks never displace water, rivers, or generated POIs.
 * @param {Tile} t
 * @returns {boolean}
 */
function isOpenGround(t) {
  return !t.overlayRef && !t.metadata.poiType && /\/(grass|forest)\//.test(t.imageRef);
}

/**
 * Bare dungeon floor — not stairs, doors, or walls — where an encounter can
 * plausibly stand.
 * @param {Tile} t
 * @returns {boolean}
 */
function isBareFloor(t) {
  return t.imageRef.includes('interior-floor');
}

/**
 * Replace a generated tile's art with a POI marker so a story encounter has a
 * visible anchor (a camp for the raiders, a cave mouth for the wyvern...).
 * @param {{ tiles: Tile[] }} gen @param {TilePalette} palette
 * @param {string} tileId @param {string} imageId @param {string} notes
 */
function stampMarker(gen, palette, tileId, imageId, notes) {
  const tile = gen.tiles.find((t) => t.id === tileId);
  const ref = palette.get(imageId)?.imageRef;
  if (!tile || !ref) return;
  tile.imageRef = ref;
  tile.overlayRef = null;
  tile.metadata = { ...tile.metadata, poiType: 'landmark', notes };
}

/**
 * The tile a generated town drew a given building on, for placing the NPC who
 * works there; falls back to the town's entry if that building didn't come up.
 * @param {{ tiles: Tile[], entry: string }} gen @param {TilePalette} palette
 * @param {string} imageId
 * @returns {string}
 */
function buildingTile(gen, palette, imageId) {
  const ref = palette.get(imageId)?.imageRef;
  return gen.tiles.find((t) => t.imageRef === ref)?.id ?? gen.entry;
}

/**
 * The example campaign, loadable on demand via the "Load example" button: the
 * 32x32 overworld plus four linked subregions, populated end to end as a
 * playable arc. Goblin raids out of the Northmarch turn out to be marching
 * under the seal of King Ostrand, the risen wight in the Barrow of the Old
 * King; the quest chain runs from crossroads rumors through the raiders' camp
 * (Chieftain Snagtooth), the wyvern Skalvyr guarding the hermit who keeps the
 * barrow's warding key, an optional bargain with the mire hag, and down into
 * the barrow to put Ostrand back in his tomb. Field enemies dot each biome,
 * Briarwick is staffed with NPCs, and handouts, a bestiary, and a two-member
 * party round out the demo. `rng` is injectable so tests can seed the
 * generated subregions.
 * @param {TilePalette} palette
 * @param {() => number} [rng]
 * @returns {Campaign}
 */
export function buildExampleCampaign(palette, rng = Math.random) {
  const grid = new TileGrid();

  // Linked entrance blocks on the overworld: 4x4 for the two wilderness
  // regions (rendered as four scaled 2x2 images), 2x2 for Briarwick, and a
  // single marker tile for the dungeon interior. Each block sits inside
  // matching terrain so the overview hints at what's inside, and Briarwick's
  // block carries a settlement POI marker so the scaled block art reads as a
  // town.
  /** @type {Record<string, { nodeId: string, poi?: { tileId: string, imageId: string, poiType: import('../types/map.js').POIType, notes?: string } }>} */
  const links = {};
  for (let y = 2; y <= 5; y++) for (let x = 4; x <= 7; x++) links[`${x},${y}`] = { nodeId: 'northmarch' };
  for (let y = 7; y <= 10; y++) for (let x = 26; x <= 29; x++) links[`${x},${y}`] = { nodeId: 'graypeak' };
  for (const [x, y] of [[11, 23], [12, 23], [11, 24], [12, 24]]) links[`${x},${y}`] = { nodeId: 'briarwick' };
  links['12,23'].poi = {
    tileId: '12,23', imageId: 'settlement', poiType: 'settlement',
    notes: 'Briarwick, a farming town on the south road. The Waystation inn is the region\'s clearing-house for news.',
  };
  links['22,10'] = {
    nodeId: 'barrow',
    poi: {
      tileId: '22,10', imageId: 'dungeon', poiType: 'dungeon',
      notes: 'The Barrow of the Old King. Warded shut for four hundred years; the ward is failing.',
    },
  };

  // Visible overworld landmarks with GM notes, so the world map itself offers
  // things to investigate between the linked regions.
  /** @type {Record<string, { imageId: string, notes: string }>} */
  const worldPOIs = {
    '9,12': {
      imageId: 'ruins',
      notes: 'The shell of an old watchtower from Ostrand\'s reign. A pale crown is carved over the fallen door.',
    },
    '14,24': {
      imageId: 'graveyard',
      notes: 'Briarwick\'s burial ground. Three graves stand open — dug out from the inside.',
    },
  };

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
        tile.metadata = {
          ...tile.metadata, poiType: link.poi.poiType, discoverable: true, notes: link.poi.notes ?? '',
        };
        world = setTile(world, tile);
        continue;
      }

      const worldPOI = worldPOIs[id];
      if (worldPOI && !link) {
        const marker = palette.get(worldPOI.imageId);
        if (marker) {
          const tile = createTile(id, marker.imageRef);
          tile.metadata = { ...tile.metadata, poiType: 'landmark', notes: worldPOI.notes };
          world = setTile(world, tile);
          continue;
        }
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
  // The layouts are random per load, so story content inside them (the boss
  // lairs, the hermit's shelter, NPC posts) is staged onto the generated
  // tiles afterwards rather than at fixed coordinates.
  const regions = [
    { id: 'northmarch', name: 'Northmarch Region', kind: /** @type {const} */ ('region'), archetype: 'wilderness' },
    { id: 'graypeak', name: 'Graypeak Highlands', kind: /** @type {const} */ ('region'), archetype: 'wilderness' },
    { id: 'briarwick', name: 'Briarwick', kind: /** @type {const} */ ('region'), archetype: 'town' },
    { id: 'barrow', name: 'Barrow of the Old King', kind: /** @type {const} */ ('interior'), archetype: 'dungeon' },
  ];
  /** @type {Record<string, { width: number, height: number, tiles: Tile[], entry: string }>} */
  const gens = {};
  for (const { id, kind, archetype } of regions) {
    gens[id] = generateNodeTiles(palette, { kind, archetype, size: 'medium' }, rng);
  }

  // Northmarch: the raiders' camp, deep in the forest, with Snagtooth at it
  // and two raiders picketed between the camp and the way in.
  const northSpots = makeSpotPicker(gens.northmarch, isOpenGround);
  const campTile = northSpots();
  stampMarker(gens.northmarch, palette, campTile, 'camp',
    'Snagtooth\'s raiding camp. Too orderly for goblins: dug latrines, posted watches, written orders.');
  const raiderTiles = [northSpots(), northSpots()];

  // Graypeak: Skalvyr's eyrie on the high ground, and Odo's hermitage pinned
  // beneath it.
  const graySpots = makeSpotPicker(gens.graypeak, isOpenGround, 4);
  const eyrieTile = graySpots();
  stampMarker(gens.graypeak, palette, eyrieTile, 'cave-entrance',
    'Skalvyr\'s eyrie. Gnawed livestock bones on the scree; the wyvern circles anything that moves below.');
  const hermitTile = graySpots();
  stampMarker(gens.graypeak, palette, hermitTile, 'ruins',
    'Odo\'s hermitage, built into a fallen shrine. The warding key hangs at his belt.');

  // The barrow: King Ostrand at the deepest chamber, his wight seneschal one
  // room out, and skeleton pickets between the door and the tomb.
  const barrowSpots = makeSpotPicker(gens.barrow, isBareFloor);
  const tombTile = barrowSpots();
  const wightTile = barrowSpots();
  const boneTiles = [barrowSpots(), barrowSpots()];

  for (const { id, name, kind } of regions) {
    const gen = gens[id];
    const node = createMapNode(id, name, 'world', gen.width, gen.height, { kind });
    grid.addNode({ ...node, tiles: gen.tiles });
  }

  // The party: a front-line knight and a half-elf cleric, both level 3, with
  // enough kit to demo inventory, equipment slots, and spell-slot tracking.
  let aldric = createCharacter('aldric', 'Ser Aldric', { STR: 16, DEX: 12, CON: 14 }, 'Human');
  aldric = withHP({ ...aldric, level: 3 }, 28);
  aldric.inventory = [
    { id: 'longsword', name: 'Longsword', quantity: 1, notes: '', type: 'weapon' },
    { id: 'oak-shield', name: 'Oak Shield', quantity: 1, notes: '', type: 'shield' },
    { id: 'chain-mail', name: 'Chain Mail', quantity: 1, notes: '', type: 'armor', armorWeight: 'heavy', baseAC: 16 },
    { id: 'steel-helm', name: 'Steel Helm', quantity: 1, notes: '', type: 'helmet', acBonus: 1 },
    { id: 'ring-of-vigor', name: 'Ring of Vigor', quantity: 1, notes: '', type: 'ring', statBonuses: { STR: 2 } },
    { id: 'healing-potion', name: 'Potion of Healing', quantity: 2, notes: 'Restores 2d4+2 HP.', type: 'consumable' },
    { id: 'torch', name: 'Torch', quantity: 5, notes: '', type: 'gear' },
  ];
  aldric.equipment = {
    helmet: 'steel-helm',
    chest: 'chain-mail',
    gloves: null,
    greaves: null,
    mainHand: 'longsword',
    offHand: 'oak-shield',
    ranged: null,
    accessory: 'ring-of-vigor',
  };

  let mirelle = createCharacter('mirelle', 'Mirelle', { WIS: 16, CHA: 13, CON: 12 }, 'Half-elf');
  mirelle = withSpellSlots(withHP({ ...mirelle, level: 3 }, 21));
  mirelle.inventory = [
    { id: 'mace', name: 'Mace', quantity: 1, notes: '', type: 'weapon' },
    { id: 'holy-symbol', name: 'Symbol of the Dawn', quantity: 1, notes: '', type: 'gear' },
    { id: 'healing-herbs', name: 'Healing Herbs', quantity: 3, notes: 'Poultice; stabilizes a downed ally.', type: 'consumable' },
  ];
  mirelle.equipment = {
    helmet: null,
    chest: null,
    gloves: null,
    greaves: null,
    mainHand: 'mace',
    offHand: null,
    ranged: null,
    accessory: null,
  };

  /**
   * A placed enemy: tiered default ability scores for its level, plus the
   * stat-block extras (AC, Speed...) a GM would want at the table.
   * @param {string} id @param {string} name @param {number} hp
   * @param {number} level @param {EnemyTier} tier
   * @param {string} nodeId @param {string} tileId
   * @param {Record<string, number>} extras
   */
  const enemy = (id, name, hp, level, tier, nodeId, tileId, extras) =>
    createEncounter(id, name, hp, { ...defaultEnemyStats(level, tier), ...extras }, { nodeId, tileId }, { level, tier });

  /**
   * A reusable bestiary blueprint for the campaign's rank-and-file enemies.
   * @param {string} id @param {string} name @param {number} hp
   * @param {number} level @param {EnemyTier} tier
   * @param {Record<string, number>} extras
   * @returns {import('../types/entities.js').EncounterTemplate}
   */
  const template = (id, name, hp, level, tier, extras) =>
    ({ id, name, maxHP: hp, statBlock: { ...defaultEnemyStats(level, tier), ...extras }, level, tier });

  return {
    grid,
    party: { nodeId: 'world', tileId: '16,16' },
    characters: [aldric, mirelle],
    encounters: [
      // Field enemies on the overworld, one flavor per biome.
      enemy('goblin-scout', 'Goblin Scout', 7, 1, 'mob', 'world', '18,15', { AC: 13, Speed: 30 }),
      enemy('gray-wolf-1', 'Gray Wolf', 11, 1, 'mob', 'world', '24,16', { AC: 13, Speed: 40 }),
      enemy('gray-wolf-2', 'Gray Wolf', 11, 1, 'mob', 'world', '25,17', { AC: 13, Speed: 40 }),
      enemy('bandit-1', 'Roadside Bandit', 11, 1, 'mob', 'world', '11,18', { AC: 12, Speed: 30 }),
      enemy('bandit-2', 'Roadside Bandit', 11, 1, 'mob', 'world', '13,20', { AC: 12, Speed: 30 }),
      enemy('bog-zombie-1', 'Bog Zombie', 22, 2, 'mob', 'world', '16,28', { AC: 8, Speed: 20 }),
      enemy('bog-zombie-2', 'Bog Zombie', 22, 2, 'mob', 'world', '19,29', { AC: 8, Speed: 20 }),
      enemy('hill-harpy', 'Harpy', 24, 2, 'mob', 'world', '23,12', { AC: 11, Speed: 20 }),
      enemy('giant-scorpion', 'Giant Scorpion', 26, 3, 'mob', 'world', '27,29', { AC: 15, Speed: 40 }),
      enemy('winter-wolf', 'Winter Wolf', 34, 3, 'mob', 'world', '26,3', { AC: 13, Speed: 50 }),
      // Minor bosses: the mire hag in the southern marsh, the goblin chieftain
      // at his camp, and the wyvern over the hermitage.
      enemy('grelka', 'Grelka the Mire Hag', 45, 4, 'legend', 'world', '20,29', { AC: 15, Speed: 30 }),
      enemy('goblin-raider-1', 'Goblin Raider', 7, 1, 'mob', 'northmarch', raiderTiles[0], { AC: 13, Speed: 30 }),
      enemy('goblin-raider-2', 'Goblin Raider', 7, 1, 'mob', 'northmarch', raiderTiles[1], { AC: 13, Speed: 30 }),
      enemy('snagtooth', 'Chieftain Snagtooth', 36, 3, 'legend', 'northmarch', campTile, { AC: 16, Speed: 30 }),
      enemy('skalvyr', 'Skalvyr the Wyvern', 68, 5, 'legend', 'graypeak', eyrieTile, { AC: 16, Speed: 20, Fly: 80 }),
      // The barrow: pickets, the seneschal, and the major boss at the tomb.
      enemy('barrow-skeleton-1', 'Barrow Skeleton', 13, 1, 'mob', 'barrow', boneTiles[0], { AC: 13, Speed: 30 }),
      enemy('barrow-skeleton-2', 'Barrow Skeleton', 13, 1, 'mob', 'barrow', boneTiles[1], { AC: 13, Speed: 30 }),
      enemy('grave-wight', 'Grave Wight', 45, 4, 'legend', 'barrow', wightTile, { AC: 14, Speed: 30 }),
      enemy('ostrand', 'King Ostrand the Risen', 110, 8, 'legend', 'barrow', tombTile, { AC: 18, Speed: 30 }),
    ],
    travelog: [],
    quests: [
      {
        id: 'rumors-at-the-waystation',
        title: 'Rumors at the Waystation',
        notes: 'Dorn\'s caravan is stuck at the crossroads until the roads are safe. Ask Bram at the Waystation inn in Briarwick what has the north country spooked.',
        status: 'active',
      },
      {
        id: 'wolves-on-the-highway',
        title: 'Wolves on the Highway',
        notes: 'A wolf pack has been running down travelers on the east highway below the Graypeak foothills. Drive it off so the caravans can move again.',
        status: 'active',
      },
      {
        id: 'the-goblin-raids',
        title: 'The Goblin Raids',
        notes: 'Goblins out of the Northmarch have burned two farms. Find their camp in the deep forest and deal with Chieftain Snagtooth — then search the camp. The raids are far too organized for goblins.',
        status: 'active',
      },
      {
        id: 'the-pale-seal',
        title: 'The Pale King\'s Seal',
        notes: 'Snagtooth\'s orders bear a pale crown pressed into gray wax. Bring them to Reeve Maera in Briarwick; she keeps the shire records of the barrow and the king inside it.',
        status: 'active',
      },
      {
        id: 'the-hermit-of-graypeak',
        title: 'The Hermit of Graypeak',
        notes: 'Odo the hermit keeps the warding key that seals the barrow\'s door. He hasn\'t come down for supplies since the wyvern Skalvyr nested above his hermitage.',
        status: 'active',
      },
      {
        id: 'the-mire-hags-bargain',
        title: 'The Mire Hag\'s Bargain (optional)',
        notes: 'Grelka the mire hag brews a grave-ward that turns a wight\'s chill. She trades fair, but never for coin — she names her price when asked, and it is always strange.',
        status: 'active',
      },
      {
        id: 'the-barrow-king',
        title: 'The Barrow of the Old King',
        notes: 'King Ostrand has risen and his reach is spreading. Take the warding key into the barrow, put down his risen court, and end him at his tomb.',
        status: 'active',
      },
    ],
    clock: createClock(),
    npcs: [
      createNPC('caravan-master-dorn', 'Dorn', {
        role: 'Caravan master, stranded at the crossroads',
        disposition: 'neutral',
        notes: 'Blunt and impatient. Pays for road news, and points anyone who looks capable at Bram in Briarwick.',
        stats: { STR: 12, CON: 14, CHA: 12 },
        location: { nodeId: 'world', tileId: '15,16' },
      }),
      createNPC('innkeeper-bram', 'Bram', {
        role: 'Innkeeper, the Waystation at Briarwick',
        disposition: 'friendly',
        notes: 'Knows every road north and gossips freely for a warm meal. First to mention the raids, the open graves, and the hermit Odo.',
        stats: { INT: 12, WIS: 14, CHA: 13 },
        location: { nodeId: 'briarwick', tileId: buildingTile(gens.briarwick, palette, 'inn') },
      }),
      createNPC('reeve-maera', 'Reeve Maera', {
        role: 'Reeve of Briarwick',
        disposition: 'neutral',
        notes: 'Keeps the shire records. Recognizes the pale crown as King Ostrand\'s seal — and knows the barrow was warded shut for a reason.',
        stats: { INT: 14, WIS: 15, CHA: 12 },
        location: {
          nodeId: 'briarwick',
          tileId: `${Math.floor(gens.briarwick.width / 2)},${Math.floor(gens.briarwick.height / 2)}`,
        },
      }),
      createNPC('sella-the-smith', 'Sella', {
        role: 'Blacksmith of Briarwick',
        disposition: 'friendly',
        notes: 'Buys ore, sells and repairs arms. Can reforge the warding key if it comes back from the barrow broken.',
        stats: { STR: 15, CON: 14 },
        location: { nodeId: 'briarwick', tileId: buildingTile(gens.briarwick, palette, 'blacksmith') },
      }),
      createNPC('sister-alwyn', 'Sister Alwyn', {
        role: 'Priestess of the Dawn, Briarwick temple',
        disposition: 'friendly',
        notes: 'Blesses weapons against the risen dead once the party learns what walks in the barrow. Quietly terrified of the open graves.',
        stats: { INT: 12, WIS: 16, CHA: 14 },
        location: { nodeId: 'briarwick', tileId: buildingTile(gens.briarwick, palette, 'temple') },
      }),
      createNPC('hermit-odo', 'Odo', {
        role: 'Hermit, keeper of the warding key',
        disposition: 'neutral',
        notes: 'Half-deaf and stubborn. Won\'t leave the hermitage while Skalvyr circles; hands over the key once the wyvern is dealt with.',
        stats: { CON: 13, INT: 13, WIS: 16 },
        location: { nodeId: 'graypeak', tileId: hermitTile },
      }),
    ],
    handouts: [
      {
        id: 'waystation-rumor',
        title: 'A Rumor at the Waystation',
        body: '"Goblins, aye — but goblins don\'t march in files, and they don\'t carry writs. Something up in the old barrow has been giving orders." — Bram, over a mug',
        nodeId: 'world',
        revealed: false,
        image: null,
      },
      {
        id: 'snagtooth-orders',
        title: 'Snagtooth\'s Orders',
        body: 'A crumpled writ in a cramped, elegant hand: "Burn the farms. Keep the road watched. Let none reach the mountain hermit before my crown is brought to me." It is sealed with a pale crown pressed into gray wax.',
        nodeId: 'northmarch',
        revealed: false,
        image: null,
      },
      {
        id: 'odos-warning',
        title: 'Odo\'s Warning',
        body: '"The key turns a lock, not a king. Ostrand was buried with his sword, his crown, and his pride — the ward kept folk out, but it kept him in just as well. Break it, go down, and finish what the old rites could not."',
        nodeId: 'graypeak',
        revealed: false,
        image: null,
      },
      {
        id: 'barrow-inscription',
        title: 'Inscription over the Barrow Door',
        body: 'Carved in the old tongue above the lintel: "HERE LIES OSTRAND, KING OF THE MARCHES, WHO WOULD NOT LIE STILL. SEALED IN THE FORTIETH YEAR. PRAY THE WARD OUTLASTS HIS PATIENCE."',
        nodeId: 'barrow',
        revealed: false,
        image: null,
      },
      {
        id: 'legend-of-ostrand',
        title: 'The Legend of King Ostrand',
        body: 'Every fireside in the Marches tells it differently, but the bones agree: a king who beggared his shires building a tomb grander than his keep, crowned in pale silver, sealed in by his own council — and patient.',
        nodeId: null,
        revealed: false,
        image: null,
      },
    ],
    bestiary: [
      template('goblin', 'Goblin', 7, 1, 'mob', { AC: 13, Speed: 30 }),
      template('gray-wolf', 'Gray Wolf', 11, 1, 'mob', { AC: 13, Speed: 40 }),
      template('bandit', 'Bandit', 11, 1, 'mob', { AC: 12, Speed: 30 }),
      template('bog-zombie', 'Bog Zombie', 22, 2, 'mob', { AC: 8, Speed: 20 }),
      template('harpy', 'Harpy', 24, 2, 'mob', { AC: 11, Speed: 20 }),
      template('giant-scorpion', 'Giant Scorpion', 26, 3, 'mob', { AC: 15, Speed: 40 }),
      template('winter-wolf', 'Winter Wolf', 34, 3, 'mob', { AC: 13, Speed: 50 }),
      template('barrow-skeleton', 'Barrow Skeleton', 13, 1, 'mob', { AC: 13, Speed: 30 }),
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
