import { capitalize } from '../util/text.js';
import {
  FURNISHING_KINDS,
  INTERIOR_KINDS,
  TOWN_WALL_KINDS,
  interiorArt,
  townWallArt,
} from './TileKinds.js';

/** @typedef {import('./TilePalette.js').PaletteEntry} PaletteEntry */

/**
 * The built-in tile catalog: one table per tile family, and the builder that
 * turns the tables into palette entries. A tile exists for the app only when
 * its family table names it. The interior, furnishing, and town wall tables
 * are in TileKinds.js, beside the rule meaning of each piece.
 */

const TILE_ROOT = 'assets/tiles';

/**
 * Terrain types with several interchangeable variants. This makes sure that
 * adjacent tiles of the same type do not look identical. Any variant fits
 * next to any other variant, because all variants share the same background
 * fill.
 * @type {Record<string, number>}
 */
const VARIANT_COUNTS = {
  grass: 3,
  forest: 3,
  mountain: 5,
  water: 3,
  desert: 3,
  swamp: 3,
  snow: 3,
  hills: 3,
  farmland: 3,
  'deep-water': 3,
  jungle: 3,
  taiga: 4,
  savanna: 3,
  badlands: 5,
  volcanic: 3,
  glacier: 3,
  'snow-hills': 3,
  'snow-mountain': 5,
  plaza: 5,
};

/**
 * Whether a palette type is a built-in terrain type with several variants.
 * @param {string} type
 * @returns {boolean}
 */
export function isVariantType(type) {
  return Object.prototype.hasOwnProperty.call(VARIANT_COUNTS, type);
}

/**
 * The interior floor families, with the number of variants of each. Each
 * variant is an interior piece with the id `<family>-<n>`, so
 * `interior-floor-2` is the second flagstone floor. The interior generators
 * pick a floor variant per cell, the same way the terrain generators pick a
 * terrain variant.
 * @type {Record<string, number>}
 */
const FLOOR_VARIANT_COUNTS = { 'interior-floor': 3, 'interior-cave-floor': 2 };

/**
 * The number of variants of a variant family, or 0 for any other name. A
 * variant family is a terrain type with variants, such as `grass`, or an
 * interior floor family, such as `interior-floor`. Its variants have the
 * palette ids `<family>-1` to `<family>-<count>`.
 * @param {string} family
 * @returns {number}
 */
export function variantCount(family) {
  const has = (/** @type {Record<string, number>} */ table) =>
    Object.prototype.hasOwnProperty.call(table, family);
  if (has(VARIANT_COUNTS)) return VARIANT_COUNTS[family];
  return has(FLOOR_VARIANT_COUNTS) ? FLOOR_VARIANT_COUNTS[family] : 0;
}

/**
 * The palette id of the variant of a family that the cell at (x, y) draws
 * when nothing picks one on purpose, or undefined for a name that is not a
 * variant family (see `variantCount`). The pick is a hash of the position,
 * so the same cell always gets the same variant, and neighbors differ about
 * as often as a random pick would make them. The tile codec relies on this:
 * a cell whose variant equals this pick stores only its family, and the
 * decoder picks it again. Adding a variant to a family changes the pick of
 * about every cell of that family in every stored map.
 * @param {string} family
 * @param {number} x
 * @param {number} y
 * @returns {string | undefined}
 */
export function variantIdAt(family, x, y) {
  const count = variantCount(family);
  return count ? `${family}-${1 + variantIndexAt(count, x, y)}` : undefined;
}

/**
 * The variant family of a palette id, or undefined when the id is not a
 * variant (see `variantCount`).
 * @param {string} id
 * @returns {string | undefined}
 */
export function variantFamilyOf(id) {
  const dash = id.lastIndexOf('-');
  const family = id.slice(0, dash);
  const n = Number(id.slice(dash + 1));
  return dash > 0 && `${family}-${n}` === id && n >= 1 && n <= variantCount(family)
    ? family
    : undefined;
}

/**
 * An index in `[0, count)` for the cell at (x, y), from a hash of the
 * position. `variantIdAt` uses it over the variants of a family.
 * @param {number} count
 * @param {number} x
 * @param {number} y
 * @returns {number}
 */
export function variantIndexAt(count, x, y) {
  // A 32-bit integer mix (the finalizer of MurmurHash3) over both
  // coordinates, so a row or a column of cells does not repeat a pattern.
  let h = Math.imul(x | 0, 0x9e3779b1) ^ Math.imul((y | 0) + 0x632be5ab, 0x85ebca77);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) % count;
}

/**
 * Whether a palette type is ground terrain: a type with variants, or a
 * custom image, which a GM paints as terrain.
 * @param {string} type
 * @returns {boolean}
 */
export function isTerrainType(type) {
  return isVariantType(type) || type === 'custom';
}

/**
 * Road pieces are not random variants. Each piece is a distinct connector
 * shape. A caller, for example autotiling logic, selects a piece based on
 * which edges must connect to neighboring road tiles.
 * @type {string[]}
 */
const ROAD_KINDS = [
  'h',
  'v',
  'cross',
  'tee-n',
  'tee-s',
  'tee-e',
  'tee-w',
  'corner-ne',
  'corner-nw',
  'corner-se',
  'corner-sw',
  'end-n',
  'end-s',
  'end-e',
  'end-w',
];

/**
 * River pieces follow the road-connector pattern: distinct channel shapes,
 * picked by which edges must meet neighboring river tiles. The list also
 * adds two bridge pieces and two ford pieces for where a road crosses the
 * channel. `bridge-h` and `ford-h` take an east-west road across a
 * north-south river, and `bridge-v` and `ford-v` take a north-south road
 * across an east-west river.
 * @type {string[]}
 */
const RIVER_KINDS = [...ROAD_KINDS, 'bridge-h', 'bridge-v', 'ford-h', 'ford-v'];

/**
 * Coast transition overlays. Water fills one half, the named edge, with a
 * sandy shoreline that fades to transparent on the other half. This lets any
 * terrain beneath, such as grass, desert, snow, or mountain, supply the land
 * side, so the palette needs no separate water-and-X tile for each biome.
 * Beyond the four straight edges there are two corner families. `corner-*` is
 * an outer corner, where water wraps the two named edges around a land tip.
 * `inner-*` is an inner corner, where water fills only the named quadrant,
 * the inside of a bay's turn.
 * @type {string[]}
 */
const COAST_KINDS = [
  'n',
  's',
  'e',
  'w',
  'corner-ne',
  'corner-nw',
  'corner-se',
  'corner-sw',
  'inner-ne',
  'inner-nw',
  'inner-se',
  'inner-sw',
];

/**
 * Dock pieces, overlays in `assets/tiles/dock/`. `pier-h` and `pier-v` are
 * straight runs of pier that go on a water tile. A `pier-head-*` piece is
 * the far end of a pier. A `quay-*` piece goes on a shore tile over its
 * straight coast piece, with the street on the land side and the pier on
 * the water side. Both families are named for the side that the pier runs
 * out to, so `quay-n` goes over `coast-n` and `pier-head-n` ends a pier
 * that runs north. No dock piece has a rule meaning, so each one is
 * `plain` and the party can walk out along a pier.
 * @type {string[]}
 */
export const DOCK_KINDS = [
  'pier-h',
  'pier-v',
  'pier-head-n',
  'pier-head-e',
  'pier-head-s',
  'pier-head-w',
  'quay-n',
  'quay-e',
  'quay-s',
  'quay-w',
];

/**
 * Palette types painted as a tile's overlayRef, layered over terrain, rather
 * than as its base image. This lets a path or shoreline cross sand, snow, or
 * other terrain, a pier stand on any water, a lighthouse stand on any
 * coast, and a furnishing stand on any floor.
 * @param {string} type
 * @returns {boolean}
 */
export function isOverlayType(type) {
  return ['road', 'river', 'coast', 'dock', 'lighthouse', 'town-wall', 'furnishing'].includes(type);
}

/**
 * Town buildings with no variants, in `assets/tiles/town/`. The art draws
 * a building over a 2x2 block, so the town generator paints each one at
 * span 2.
 * @type {string[]}
 */
const TOWN_BUILDINGS = [
  'house',
  'burned-house',
  'cottage',
  'burned-cottage',
  'market',
  'burned-market',
  'well',
  'fountain',
  'town-hall',
  'burned-town-hall',
  'guildhall',
  'burned-guildhall',
  'bakery',
  'burned-bakery',
  'warehouse',
  'burned-warehouse',
  'stables',
  'burned-stables',
  'windmill',
  'burned-windmill',
  'watermill',
  'burned-watermill',
];

/**
 * Single-image POI markers with no variants.
 * @type {string[]}
 */
const MARKER_TYPES = [
  'settlement',
  'dungeon',
  'castle',
  'ruined-castle',
  'tavern',
  'burned-tavern',
  'inn',
  'burned-inn',
  'blacksmith',
  'burned-blacksmith',
  'general-store',
  'burned-general-store',
  'alchemist',
  'temple',
  'shrine',
  'wizard-tower',
  'ruined-wizard-tower',
  'academy',
  'barracks',
  'ruins',
  'cave-entrance',
  'mine',
  'port',
  'farm',
  'burned-farm',
  'graveyard',
  'camp',
  'standing-stones',
  'village',
  'city',
  'oasis',
  'watchtower',
  'burned-watchtower',
];

/**
 * "general-store" -> "General Store"
 * @param {string} type
 * @returns {string}
 */
export function titleCase(type) {
  return type.split('-').map(capitalize).join(' ');
}

/** @returns {PaletteEntry[]} */
export function buildBuiltins() {
  /** @type {PaletteEntry[]} */
  const entries = [];

  for (const [type, count] of Object.entries(VARIANT_COUNTS)) {
    for (let i = 1; i <= count; i++) {
      entries.push({
        id: `${type}-${i}`,
        type,
        label: `${titleCase(type)} ${i}`,
        imageRef: `${TILE_ROOT}/${type}/${type}-${i}.svg`,
        custom: false,
      });
    }
  }

  for (const kind of ROAD_KINDS) {
    entries.push({
      id: `road-${kind}`,
      type: 'road',
      label: `Road (${kind})`,
      imageRef: `${TILE_ROOT}/road/road-${kind}.svg`,
      custom: false,
    });
  }

  for (const kind of RIVER_KINDS) {
    entries.push({
      id: `river-${kind}`,
      type: 'river',
      label: `River (${kind})`,
      imageRef: `${TILE_ROOT}/river/river-${kind}.svg`,
      custom: false,
    });
  }

  for (const kind of COAST_KINDS) {
    entries.push({
      id: `coast-${kind}`,
      type: 'coast',
      label: `Coast (${kind})`,
      imageRef: `${TILE_ROOT}/coast/coast-${kind}.svg`,
      custom: false,
    });
  }

  for (const kind of DOCK_KINDS) {
    entries.push({
      id: `dock-${kind}`,
      type: 'dock',
      label: `Dock (${kind})`,
      imageRef: `${TILE_ROOT}/dock/dock-${kind}.svg`,
      custom: false,
    });
  }

  // The lighthouse is an overlay, so it stands on any coast piece.
  entries.push({
    id: 'lighthouse',
    type: 'lighthouse',
    label: 'Lighthouse',
    imageRef: `${TILE_ROOT}/lighthouse/lighthouse.svg`,
    custom: false,
  });

  for (const type of MARKER_TYPES) {
    entries.push({
      id: type,
      type,
      label: titleCase(type),
      imageRef: `${TILE_ROOT}/${type}/${type}.svg`,
      custom: false,
    });
  }

  for (const type of TOWN_BUILDINGS) {
    entries.push({
      id: type,
      type,
      label: titleCase(type),
      imageRef: `${TILE_ROOT}/town/${type}.svg`,
      custom: false,
    });
  }

  for (const kind of Object.keys(TOWN_WALL_KINDS)) {
    entries.push({
      id: `town-${kind}`,
      type: 'town-wall',
      label: `Town Wall (${kind})`,
      imageRef: townWallArt(kind),
      custom: false,
    });
  }

  for (const kind of Object.keys(INTERIOR_KINDS)) {
    entries.push({
      id: `interior-${kind}`,
      type: 'interior',
      label: `Interior (${kind})`,
      imageRef: interiorArt(kind),
      custom: false,
    });
  }

  for (const kind of Object.keys(FURNISHING_KINDS)) {
    entries.push({
      id: `interior-${kind}`,
      type: 'furnishing',
      label: titleCase(kind),
      imageRef: interiorArt(kind),
      custom: false,
    });
  }

  return entries;
}
