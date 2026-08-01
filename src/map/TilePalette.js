import { capitalize } from '../util/text.js';

/** @typedef {{ id: string, type: string, label: string, imageRef: string, custom: boolean }} PaletteEntry */
/** @typedef {import('../types/map.js').TileKind} TileKind */

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
  mountain: 3,
  water: 3,
  desert: 3,
  swamp: 3,
  snow: 3,
  hills: 3,
  farmland: 3,
};

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
 * adds two bridge pieces for where a road crosses the channel. `bridge-h`
 * carries an east-west road over a north-south river. `bridge-v` carries the
 * reverse.
 * @type {string[]}
 */
const RIVER_KINDS = [...ROAD_KINDS, 'bridge-h', 'bridge-v'];

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
 * Palette types painted as a tile's overlayRef, layered over terrain, rather
 * than as its base image. This lets a path or shoreline cross sand, snow, or
 * other terrain.
 * @param {string} type
 * @returns {boolean}
 */
export function isOverlayType(type) {
  return type === 'road' || type === 'river' || type === 'coast';
}

/**
 * Single-image POI markers with no variants.
 * @type {string[]}
 */
const MARKER_TYPES = [
  'settlement',
  'dungeon',
  'castle',
  'tavern',
  'inn',
  'blacksmith',
  'general-store',
  'alchemist',
  'temple',
  'shrine',
  'wizard-tower',
  'academy',
  'barracks',
  'ruins',
  'cave-entrance',
  'mine',
  'port',
  'farm',
  'graveyard',
  'camp',
  'standing-stones',
];

/**
 * Building-interior pieces, such as castle halls and shop floors. Like roads,
 * these are distinct shapes picked on purpose, not random variants:
 * flagstone floors, wall segments and corners that share one cross-section,
 * doors, and stairs.
 *
 * The list states each piece with its meaning to the rules, because several
 * pieces carry a rule: the party cannot stand on a wall, a door is the
 * authored way into a space, and stairs connect one dungeon level to the
 * next. Keeping the meaning here, beside the art, lets `kindOf` answer the
 * question from an image reference, with no code matching on a file name.
 * @type {Record<string, TileKind>}
 */
const INTERIOR_KINDS = {
  'floor-1': 'floor',
  'floor-2': 'floor',
  'floor-3': 'floor',
  'wall-h': 'wall',
  'wall-v': 'wall',
  'wall-corner-ne': 'wall',
  'wall-corner-nw': 'wall',
  'wall-corner-se': 'wall',
  'wall-corner-sw': 'wall',
  'wall-tee-n': 'wall',
  'wall-tee-e': 'wall',
  'wall-tee-s': 'wall',
  'wall-tee-w': 'wall',
  'wall-cross': 'wall',
  'door-h': 'door',
  'door-v': 'door',
  'stairs-up': 'stairs-up',
  'stairs-down': 'stairs-down',
};

/**
 * Every built-in image reference that carries a rule meaning, mapped to that
 * meaning. The code builds this map from the catalog above, so the art path
 * and the meaning are stated together in one place. Renaming an asset cannot
 * change a rule without notice.
 * @type {Map<string, TileKind>}
 */
const KIND_BY_REF = new Map(
  Object.entries(INTERIOR_KINDS).map(([kind, meaning]) => [
    `${TILE_ROOT}/interior/interior-${kind}.svg`,
    meaning,
  ]),
);

/**
 * What a tile's art means to the rules. Anything outside the interior set is
 * `plain`, which is walkable and has no special meaning. This includes
 * outdoor terrain, POI markers, and every custom or `data:` image that a GM
 * supplies.
 * @param {string} imageRef
 * @returns {TileKind}
 */
export function kindOf(imageRef) {
  return KIND_BY_REF.get(imageRef) ?? 'plain';
}

/**
 * "general-store" -> "General Store"
 * @param {string} type
 * @returns {string}
 */
function titleCase(type) {
  return type.split('-').map(capitalize).join(' ');
}

/** @returns {PaletteEntry[]} */
function buildBuiltins() {
  /** @type {PaletteEntry[]} */
  const entries = [];

  for (const [type, count] of Object.entries(VARIANT_COUNTS)) {
    for (let i = 1; i <= count; i++) {
      entries.push({
        id: `${type}-${i}`,
        type,
        label: `${capitalize(type)} ${i}`,
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

  for (const type of MARKER_TYPES) {
    entries.push({
      id: type,
      type,
      label: titleCase(type),
      imageRef: `${TILE_ROOT}/${type}/${type}.svg`,
      custom: false,
    });
  }

  for (const kind of Object.keys(INTERIOR_KINDS)) {
    entries.push({
      id: `interior-${kind}`,
      type: 'interior',
      label: `Interior (${kind})`,
      imageRef: `${TILE_ROOT}/interior/interior-${kind}.svg`,
      custom: false,
    });
  }

  return entries;
}

/**
 * Holds the built-in tile catalog plus any user-supplied custom tile images,
 * keyed by id so callers can look up an imageRef when placing a tile.
 */
export class TilePalette {
  constructor() {
    /** @type {Map<string, PaletteEntry>} */
    this.entries = new Map(buildBuiltins().map((entry) => [entry.id, entry]));
  }

  /**
   * Register a custom tile image, for example a data: URL read from a file
   * input. Throws if the id collides with an existing built-in entry.
   * @param {string} id
   * @param {string} label
   * @param {string} imageRef
   * @param {string} [type]
   * @returns {PaletteEntry}
   */
  addCustom(id, label, imageRef, type = 'custom') {
    const existing = this.entries.get(id);
    if (existing && !existing.custom) {
      throw new Error(`Cannot override built-in tile "${id}"`);
    }
    const entry = { id, type, label, imageRef, custom: true };
    this.entries.set(id, entry);
    return entry;
  }

  /**
   * Remove a custom tile entry. The function does nothing, and refuses, for
   * built-in entries.
   * @param {string} id
   */
  removeCustom(id) {
    const existing = this.entries.get(id);
    if (!existing || !existing.custom) return;
    this.entries.delete(id);
  }

  /**
   * @param {string} id
   * @returns {PaletteEntry | undefined}
   */
  get(id) {
    return this.entries.get(id);
  }

  /**
   * All entries, built-in and custom, that belong to a given type.
   * @param {string} type
   * @returns {PaletteEntry[]}
   */
  listVariants(type) {
    return [...this.entries.values()].filter((e) => e.type === type);
  }

  /**
   * Pick a random variant of a terrain type. The caller supplies the RNG so
   * tests can control it.
   * @param {string} type
   * @param {() => number} rng returns a float in [0, 1)
   * @returns {PaletteEntry}
   */
  pickVariant(type, rng) {
    const variants = this.listVariants(type);
    if (variants.length === 0) throw new Error(`No variants registered for type "${type}"`);
    return variants[Math.floor(rng() * variants.length) % variants.length];
  }

  /**
   * Look up a specific road connector piece by kind, for example "h",
   * "corner-ne", or "end-n".
   * @param {string} kind
   * @returns {PaletteEntry | undefined}
   */
  getRoadPiece(kind) {
    return this.entries.get(`road-${kind}`);
  }

  /**
   * Look up a specific river connector piece by kind, for example "h",
   * "corner-ne", or "bridge-h".
   * @param {string} kind
   * @returns {PaletteEntry | undefined}
   */
  getRiverPiece(kind) {
    return this.entries.get(`river-${kind}`);
  }

  /**
   * Look up a coast transition piece by the edge its water half faces, for
   * example "n", "s", "e", or "w".
   * @param {string} kind
   * @returns {PaletteEntry | undefined}
   */
  getCoastPiece(kind) {
    return this.entries.get(`coast-${kind}`);
  }

  /**
   * Look up a specific interior piece by kind, for example "floor-1",
   * "wall-h", or "stairs-up".
   * @param {string} kind
   * @returns {PaletteEntry | undefined}
   */
  getInteriorPiece(kind) {
    return this.entries.get(`interior-${kind}`);
  }

  /** @returns {PaletteEntry[]} */
  listBuiltins() {
    return [...this.entries.values()].filter((e) => !e.custom);
  }

  /** @returns {PaletteEntry[]} */
  listCustom() {
    return [...this.entries.values()].filter((e) => e.custom);
  }

  /** @returns {PaletteEntry[]} */
  listAll() {
    return [...this.entries.values()];
  }
}
