import { overlayList, tilesById } from './TileGrid.js';
import { stackOverlay } from './TilePaint.js';
import { tileIdAt } from './MapGeometry.js';
import { ARMS } from './Autotile.js';
import { randInt, shuffle } from './GeneratorRandom.js';
import { chebyshev, southLanding, terrainTiles, wildTerrain } from './GeneratorGround.js';
import { connectSites, plantFarmland, planSites, siteMap } from './GeneratorSites.js';
import { clamp } from '../util/num.js';

/** @typedef {import('../types/map.js').Tile} Tile */
/** @typedef {import('./TilePalette.js').TilePalette} TilePalette */
/** @typedef {import('../types/map.js').GeneratedSite} GeneratedSite */
/** @typedef {import('../types/map.js').TerrainGuide} TerrainGuide */
/** @typedef {import('./GeneratorSites.js').Site} Site */
/** @typedef {import('./GeneratorGround.js').WildTerrain} WildTerrain */

/**
 * The open-terrain archetypes: wilderness and its climate variants. Each one
 * builds its ground with `wildTerrain` in GeneratorGround.js, which runs the
 * climate model with the profile of the archetype, draws shorelines, and
 * traces rivers down from the high ground. Then it places
 * settlements, a keep, and a dungeon, joins them with roads, and scatters
 * landmarks.
 * Without a guide, the terrain covers every cell, so the map meets its
 * parent along the whole border. A guided map covers the outline of its
 * block alone (see `GeneratorGuide.paintedMask`).
 */

/**
 * @typedef {{ near?: string[], road?: boolean, on?: string, coast?: boolean }} LandmarkNeeds
 * `near` lists the terrain the landmark prefers as a neighbor, and `road`
 * makes it prefer a cell beside a road. `on` is the terrain class that its
 * cell must have. `coast` makes it need a coast piece on its cell and open
 * water within two cells, and it goes on as an overlay over the coast piece.
 */

/**
 * Landmark markers and where each one belongs. A mine or a cave sits at the
 * foot of the hills, a camp at the edge of a wood, and a watchtower beside
 * a road. An oasis stands only in the desert, and a lighthouse only on a
 * shoreline that faces open water. A landmark with no needs fits anywhere.
 * @type {Record<string, LandmarkNeeds>}
 */
const LANDMARK_AFFINITY = {
  ruins: {},
  camp: { near: ['forest'] },
  'standing-stones': { near: ['hills'] },
  mine: { near: ['hills', 'mountain'] },
  'cave-entrance': { near: ['mountain', 'hills'] },
  graveyard: {},
  watchtower: { road: true },
  oasis: { on: 'desert' },
  lighthouse: { coast: true },
};

/**
 * The landmarks that open into a sub-map, and the archetype of that map.
 * @type {Record<string, string>}
 */
const LANDMARK_MAPS = { 'cave-entrance': 'cave', mine: 'cave', ruins: 'dungeon' };

/** A coast piece image path. */
const COAST_PIECE = /\/tiles\/coast\//;

/** The fewest water cells within two cells that count as open water. */
const OPEN_WATER = 4;

/** A road crossing farther than this from every town is a ford. */
const FORD_DISTANCE = 3;

/**
 * Scatter landmark markers over open ground away from the border. Marker art
 * sits on a grass background, so a landmark prefers a grass cell. Each
 * landmark then prefers a cell beside the terrain or the road it belongs
 * to. A map with no free grass, such as a desert, still gets its landmarks
 * on other open ground, where the grass under the marker reads as a
 * clearing. A landmark with a need that no free cell meets, or with no art
 * in the palette, gives its turn to the next landmark in the order. A
 * lighthouse is an overlay, so it keeps the terrain and the coast piece of
 * its cell and has no grass under it.
 * Landmarks keep at least three cells from each other and from every marker
 * already on the map, such as a settlement.
 * @param {TilePalette} palette
 * @param {WildTerrain} terrain
 * @param {Tile[]} tiles
 * @param {number} count
 * @param {() => number} rng
 * @returns {string[]} the tile ids that got a landmark
 */
export function placeLandmarks(palette, terrain, tiles, count, rng) {
  const { size, cells, roads } = terrain;
  const byId = tilesById(tiles);
  /**
   * Whether a landmark can go on (x, y). A marker needs a cell with no
   * overlay, and a coast landmark needs a cell whose only overlay is a coast
   * piece, so it never covers a road or a river mouth.
   * @param {number} x @param {number} y @param {boolean} [coast]
   */
  const free = (x, y, coast = false) => {
    const type = cells[y * size + x];
    const tile = byId.get(tileIdAt(x, y));
    const overlays = tile ? overlayList(tile) : [];
    const fits = coast
      ? overlays.length === 1 && COAST_PIECE.test(overlays[0])
      : overlays.length === 0;
    return (
      Boolean(tile && fits && !tile.childNodeId && !tile.metadata.poiType) &&
      type !== 'water' &&
      type !== 'mountain'
    );
  };
  /** @type {[number, number][]} */
  const placed = tiles
    .filter((t) => t.metadata.poiType)
    .map((t) => /** @type {[number, number]} */ (t.id.split(',').map(Number)));
  const before = placed.length;
  /**
   * Put one landmark of `type` on its best free cell.
   * @param {string} type
   * @returns {boolean} whether the landmark found a cell
   */
  const placeOne = (type) => {
    const needs = LANDMARK_AFFINITY[type];
    const ref = palette.get(type)?.imageRef;
    if (!ref) return false;
    /** @type {{ x: number, y: number, score: number }[]} */
    const spots = [];
    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        if (!free(x, y, needs.coast)) continue;
        if (placed.some(([px, py]) => chebyshev(px, py, x, y) < 3)) continue;
        if (needs.on && cells[y * size + x] !== needs.on) continue;
        if (needs.coast && countNear(cells, size, x, y, 2, 'water') < OPEN_WATER) continue;
        let score = !needs.coast && cells[y * size + x] === 'grass' ? 2 : 0;
        if (needs.near?.some((t) => countNear(cells, size, x, y, 1, t))) score += 1;
        if (needs.road && ARMS.some(([, dx, dy]) => roads.has(x + dx, y + dy))) score += 1;
        spots.push({ x, y, score });
      }
    }
    if (!spots.length) return false;
    const best = Math.max(...spots.map((s) => s.score));
    const top = spots.filter((s) => s.score === best);
    const { x, y } = top[randInt(rng, top.length)];
    const tile = /** @type {Tile} */ (byId.get(tileIdAt(x, y)));
    if (needs.coast) tile.overlayRef = stackOverlay(tile.overlayRef, ref);
    else tile.imageRef = ref;
    tile.metadata = { ...tile.metadata, poiType: 'landmark' };
    placed.push([x, y]);
    return true;
  };
  const order = shuffle(Object.keys(LANDMARK_AFFINITY), rng);
  let next = 0;
  for (let i = 0; i < count; i++) {
    let done = false;
    for (let tries = 0; tries < order.length && !done; tries++) {
      done = placeOne(order[next++ % order.length]);
    }
    if (!done) break;
  }
  return placed.slice(before).map(([x, y]) => tileIdAt(x, y));
}

/**
 * How many cells within `r` of (x, y), not counting (x, y), have terrain
 * `type`.
 * @param {string[]} cells @param {number} size @param {number} x @param {number} y
 * @param {number} r @param {string} type
 */
function countNear(cells, size, x, y, r, type) {
  let count = 0;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if ((dx || dy) && nx >= 0 && ny >= 0 && nx < size && ny < size) {
        if (cells[ny * size + nx] === type) count++;
      }
    }
  }
  return count;
}
/**
 * The road crossings that draw as fords: each crossing farther than
 * FORD_DISTANCE from every town, where a track through the wild has no
 * bridge.
 * @param {WildTerrain} terrain @param {Site[]} sites
 * @returns {Set<string>}
 */
export function fordCrossings(terrain, sites) {
  const towns = sites.filter((s) => s.archetype === 'town');
  /** @type {Set<string>} */
  const fords = new Set();
  for (const id of terrain.roads.arms.keys()) {
    const [x, y] = id.split(',').map(Number);
    if (!terrain.rivers.has(x, y)) continue;
    if (towns.every((s) => chebyshev(s.x, s.y, x, y) > FORD_DISTANCE)) {
      fords.add(id);
    }
  }
  return fords;
}

/**
 * Generate an open-terrain map for one of the climate archetypes:
 * wilderness, highlands, frontier, desert, wetlands, or island. The entry
 * is the border tile where the first road leaves the map. A map with no
 * road off the map, such as an island, enters on the land nearest the
 * middle of the south border (see `southLanding`), on a tile with no
 * marker. `sites` lists the settlements, the keep, the dungeon, and each
 * cave entrance, mine, and ruin that drew its marker, each with the
 * sub-map it opens into. A mine and a cave entrance open into a cave, and a
 * ruin into a dungeon. A guided map has tiles only inside the outline of
 * its block (see `GeneratorGuide.paintedMask`), and no site, road, or
 * landmark outside it.
 * @param {TilePalette} palette
 * @param {number} size
 * @param {() => number} rng
 * @param {string} [archetype] a key of TERRAIN_PROFILES
 * @param {TerrainGuide} [guide] the parent terrain that the ground follows
 *   (see `GeneratorGround.wildTerrain`)
 * @returns {{ tiles: Tile[], entry: string, sites: GeneratedSite[] }}
 */
export function generateWilds(palette, size, rng, archetype = 'wilderness', guide) {
  const terrain = wildTerrain(size, archetype, rng, guide);
  const { painted } = terrain;
  // A blank cell counts as water while the sites, the roads, and the
  // landmarks find their cells, so none of them stands outside the outline.
  // It draws with its own class, so the land beside it gets no shoreline.
  const own = terrain.cells;
  if (painted) terrain.cells = own.map((c, i) => (painted[i] ? c : 'water'));
  const sites = planSites(terrain, rng);
  plantFarmland(terrain, sites, rng);
  const { roads, exits } = connectSites(terrain, sites);
  terrain.roads = roads;
  const fords = fordCrossings(terrain, sites);
  const drawn = painted ? terrain.cells.map((c, i) => (painted[i] ? c : own[i])) : terrain.cells;
  const tiles = terrainTiles(
    palette,
    { ...terrain, cells: drawn, fords },
    rng,
    new Set(sites.map((s) => s.tileId)),
  );

  const byId = tilesById(tiles);
  /** @type {GeneratedSite[]} */
  const maps = [];
  for (const site of sites) {
    const tile = /** @type {Tile} */ (byId.get(site.tileId));
    const ref = palette.get(site.marker)?.imageRef;
    if (!ref) continue;
    tile.imageRef = ref;
    tile.metadata = { ...tile.metadata, poiType: site.poi };
    maps.push(siteMap(site));
  }
  const landmarks = placeLandmarks(palette, terrain, tiles, clamp(Math.round(size / 7), 1), rng);
  for (const id of landmarks) {
    const ref = /** @type {Tile} */ (byId.get(id)).imageRef;
    const type = Object.keys(LANDMARK_MAPS).find((t) => palette.get(t)?.imageRef === ref);
    if (!type) continue;
    const inside = LANDMARK_MAPS[type];
    maps.push({
      tileIds: [id],
      archetype: inside,
      kind: 'interior',
      environ: inside,
      size: 'medium',
      label: type,
    });
  }
  // The tiles run in the same row-major order as the cells.
  const entry =
    exits[0] ?? southLanding(terrain.cells, size, (i) => Boolean(tiles[i].metadata.poiType));
  const kept = painted ? tiles.filter((_, i) => painted[i]) : tiles;
  return { tiles: kept, entry, sites: maps };
}
