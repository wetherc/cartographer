import { createMapNode, createTile, setTile, TileGrid } from '../map/TileGrid.js';
import { generateNodeTiles } from '../map/MapGenerator.js';
import { coastOverlays, smoothCoastline } from '../map/Autotile.js';
import { withNodeTiles } from '../map/TileIndex.js';

/** @typedef {import('../map/TilePalette.js').TilePalette} TilePalette */
/** @typedef {import('../types/map.js').Tile} Tile */

/**
 * One generated subregion's layout plus the tile ids the story content is
 * staged on (picked from the generated tiles, since layouts are random).
 * @typedef {{ width: number, height: number, tiles: Tile[], entry: string }} GeneratedNode
 */

/**
 * The example world's maps and staged story locations: the overworld grid,
 * the four generated subregions, and the tile ids the bosses, pickets, and
 * the hermit were placed on.
 * @typedef {{
 *   grid: TileGrid,
 *   gens: Record<string, GeneratedNode>,
 *   spots: {
 *     campTile: string,
 *     raiderTiles: string[],
 *     eyrieTile: string,
 *     hermitTile: string,
 *     tombTile: string,
 *     wightTile: string,
 *     boneTiles: string[],
 *   },
 * }} ExampleWorld
 */

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
 * @param {GeneratedNode} gen
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
 * @param {GeneratedNode} gen @param {TilePalette} palette
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
 * @param {GeneratedNode} gen @param {TilePalette} palette
 * @param {string} imageId
 * @returns {string}
 */
export function buildingTile(gen, palette, imageId) {
  const ref = palette.get(imageId)?.imageRef;
  return gen.tiles.find((t) => t.imageRef === ref)?.id ?? gen.entry;
}

/**
 * Build the example campaign's maps: the hand-shaped 32x32 overworld with its
 * roads, river, coastline, and linked entrance blocks, plus the four generated
 * subregions (two wilderness regions, the town, the dungeon), with story
 * locations (boss lairs, pickets, the hermitage) staged onto the generated
 * tiles. Content that populates these locations lives in ExampleContent.js.
 * @param {TilePalette} palette
 * @param {() => number} [rng]
 * @returns {ExampleWorld}
 */
export function buildExampleWorld(palette, rng = Math.random) {
  const grid = new TileGrid();

  // Linked entrance blocks on the overworld: 4x4 for the two wilderness
  // regions (rendered as four scaled 2x2 images), 2x2 for Briarwick, and a
  // single marker tile for the dungeon interior. Each block sits inside
  // matching terrain so the overview hints at what's inside, and Briarwick's
  // block carries a settlement POI marker so the scaled block art reads as a
  // town.
  /** @type {Record<string, { nodeId: string, poi?: { tileId: string, imageId: string, poiType: import('../types/map.js').POIType, notes?: string } }>} */
  const links = {};
  for (let y = 2; y <= 5; y++)
    for (let x = 4; x <= 7; x++) links[`${x},${y}`] = { nodeId: 'northmarch' };
  for (let y = 7; y <= 10; y++)
    for (let x = 26; x <= 29; x++) links[`${x},${y}`] = { nodeId: 'graypeak' };
  for (const [x, y] of [
    [11, 23],
    [12, 23],
    [11, 24],
    [12, 24],
  ])
    links[`${x},${y}`] = { nodeId: 'briarwick' };
  links['12,23'].poi = {
    tileId: '12,23',
    imageId: 'settlement',
    poiType: 'settlement',
    notes:
      "Briarwick, a farming town on the south road. The Waystation inn is the region's clearing-house for news.",
  };
  links['22,10'] = {
    nodeId: 'barrow',
    poi: {
      tileId: '22,10',
      imageId: 'dungeon',
      poiType: 'dungeon',
      notes: 'The Barrow of the Old King. Warded shut for four hundred years; the ward is failing.',
    },
  };

  // Visible overworld landmarks with GM notes, so the world map itself offers
  // things to investigate between the linked regions.
  /** @type {Record<string, { imageId: string, notes: string }>} */
  const worldPOIs = {
    '9,12': {
      imageId: 'ruins',
      notes:
        "The shell of an old watchtower from Ostrand's reign. A pale crown is carved over the fallen door.",
    },
    '14,24': {
      imageId: 'graveyard',
      notes: "Briarwick's burial ground. Three graves stand open — dug out from the inside.",
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
      const onRiver =
        (x === RIVER_X && y <= RIVER_BEND_Y) || (y === RIVER_BEND_Y && x >= 10 && x < RIVER_X);
      if (!link && (onHighway || onBranch || onRiver)) {
        const overlay = onRiver
          ? palette.getRiverPiece(
              x === RIVER_X
                ? y === 16
                  ? 'bridge-h'
                  : y === RIVER_BEND_Y
                    ? 'corner-nw'
                    : 'v'
                : 'h',
            )
          : onHighway
            ? palette.getRoadPiece(
                x === 3 ? 'end-e' : x === last ? 'end-w' : x === 12 ? 'tee-s' : 'h',
              )
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
          ...tile.metadata,
          poiType: link.poi.poiType,
          discoverable: true,
          notes: link.poi.notes ?? '',
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

      const terrain = link
        ? { northmarch: 'forest', graypeak: 'mountain', briarwick: 'grass' }[link.nodeId]
        : terrainAt(x, y);
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
    {
      id: 'northmarch',
      name: 'Northmarch Region',
      kind: /** @type {const} */ ('region'),
      archetype: 'wilderness',
    },
    {
      id: 'graypeak',
      name: 'Graypeak Highlands',
      kind: /** @type {const} */ ('region'),
      archetype: 'wilderness',
    },
    {
      id: 'briarwick',
      name: 'Briarwick',
      kind: /** @type {const} */ ('region'),
      archetype: 'town',
    },
    {
      id: 'barrow',
      name: 'Barrow of the Old King',
      kind: /** @type {const} */ ('interior'),
      archetype: 'dungeon',
    },
  ];
  /** @type {Record<string, GeneratedNode>} */
  const gens = {};
  for (const { id, kind, archetype } of regions) {
    gens[id] = generateNodeTiles(palette, { kind, archetype, size: 'medium' }, rng);
  }

  // Northmarch: the raiders' camp, deep in the forest, with Snagtooth at it
  // and two raiders picketed between the camp and the way in.
  const northSpots = makeSpotPicker(gens.northmarch, isOpenGround);
  const campTile = northSpots();
  stampMarker(
    gens.northmarch,
    palette,
    campTile,
    'camp',
    "Snagtooth's raiding camp. Too orderly for goblins: dug latrines, posted watches, written orders.",
  );
  const raiderTiles = [northSpots(), northSpots()];

  // Graypeak: Skalvyr's eyrie on the high ground, and Odo's hermitage pinned
  // beneath it.
  const graySpots = makeSpotPicker(gens.graypeak, isOpenGround, 4);
  const eyrieTile = graySpots();
  stampMarker(
    gens.graypeak,
    palette,
    eyrieTile,
    'cave-entrance',
    "Skalvyr's eyrie. Gnawed livestock bones on the scree; the wyvern circles anything that moves below.",
  );
  const hermitTile = graySpots();
  stampMarker(
    gens.graypeak,
    palette,
    hermitTile,
    'ruins',
    "Odo's hermitage, built into a fallen shrine. The warding key hangs at his belt.",
  );

  // The barrow: King Ostrand at the deepest chamber, his wight seneschal one
  // room out, and skeleton pickets between the door and the tomb.
  const barrowSpots = makeSpotPicker(gens.barrow, isBareFloor);
  const tombTile = barrowSpots();
  const wightTile = barrowSpots();
  const boneTiles = [barrowSpots(), barrowSpots()];

  for (const { id, name, kind } of regions) {
    const gen = gens[id];
    const node = createMapNode(id, name, 'world', gen.width, gen.height, { kind });
    grid.addNode(withNodeTiles(node, gen.tiles));
  }

  return {
    grid,
    gens,
    spots: { campTile, raiderTiles, eyrieTile, hermitTile, tombTile, wightTile, boneTiles },
  };
}
