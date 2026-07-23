/** @typedef {{ id: string, type: string, label: string, imageRef: string, custom: boolean }} PaletteEntry */

const TILE_ROOT = 'assets/tiles';

/**
 * Terrain types with multiple interchangeable variants, so adjacent tiles of
 * the same type don't look identical. Any variant abuts any other cleanly
 * because they share the same background fill.
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
 * Road pieces are not random variants: each is a distinct connector shape,
 * selected by a caller (e.g. autotiling logic) based on which edges must
 * connect to neighboring road tiles.
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
 * River pieces follow the road-connector pattern: distinct channel shapes
 * picked by which edges must meet neighboring river tiles, plus two bridge
 * pieces where a road crosses the channel (`bridge-h` carries an east-west
 * road over a north-south river; `bridge-v` the reverse).
 * @type {string[]}
 */
const RIVER_KINDS = [...ROAD_KINDS, 'bridge-h', 'bridge-v'];

/**
 * Coast transition overlays: water fills one half (the named edge) with a
 * sandy shoreline fading to transparent on the other, so any terrain beneath
 * (grass, desert, snow, mountain) supplies the land side without needing a
 * water-and-X tile per biome. Beyond the four straight edges there are two
 * corner families: `corner-*` (outer corner — water wraps the two named edges
 * around a land tip) and `inner-*` (inner corner — water fills only the named
 * quadrant, the inside of a bay's turn).
 * @type {string[]}
 */
const COAST_KINDS = [
  'n', 's', 'e', 'w',
  'corner-ne', 'corner-nw', 'corner-se', 'corner-sw',
  'inner-ne', 'inner-nw', 'inner-se', 'inner-sw',
];

/**
 * Palette types painted as a tile's overlayRef (layered over terrain) rather
 * than as its base image, so a path or shoreline can cross sand, snow, etc.
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
 * Building-interior pieces (castle halls, shop floors). Like roads these are
 * distinct shapes picked deliberately, not random variants: flagstone floors,
 * wall segments/corners sharing one cross-section, doors, and stairs.
 * @type {string[]}
 */
const INTERIOR_KINDS = [
  'floor-1',
  'floor-2',
  'floor-3',
  'wall-h',
  'wall-v',
  'wall-corner-ne',
  'wall-corner-nw',
  'wall-corner-se',
  'wall-corner-sw',
  'wall-tee-n',
  'wall-tee-e',
  'wall-tee-s',
  'wall-tee-w',
  'wall-cross',
  'door-h',
  'door-v',
  'stairs-up',
  'stairs-down',
];

/**
 * "general-store" -> "General Store"
 * @param {string} type
 * @returns {string}
 */
function titleCase(type) {
  return type
    .split('-')
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ');
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
        label: `${type[0].toUpperCase()}${type.slice(1)} ${i}`,
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

  for (const kind of INTERIOR_KINDS) {
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
   * Register a custom tile image (e.g. a data: URL read from a file input).
   * Throws if the id collides with an existing built-in entry.
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
   * Remove a custom tile entry. No-op (and refuses) for built-ins.
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
   * All entries (built-in and custom) belonging to a given type.
   * @param {string} type
   * @returns {PaletteEntry[]}
   */
  listVariants(type) {
    return [...this.entries.values()].filter((e) => e.type === type);
  }

  /**
   * Pick a random variant of a terrain type, via an injected RNG for testability.
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
   * Look up a specific road connector piece by kind (e.g. "h", "corner-ne", "end-n").
   * @param {string} kind
   * @returns {PaletteEntry | undefined}
   */
  getRoadPiece(kind) {
    return this.entries.get(`road-${kind}`);
  }

  /**
   * Look up a specific river connector piece by kind (e.g. "h", "corner-ne", "bridge-h").
   * @param {string} kind
   * @returns {PaletteEntry | undefined}
   */
  getRiverPiece(kind) {
    return this.entries.get(`river-${kind}`);
  }

  /**
   * Look up a coast transition piece by the edge its water half faces ("n", "s", "e", "w").
   * @param {string} kind
   * @returns {PaletteEntry | undefined}
   */
  getCoastPiece(kind) {
    return this.entries.get(`coast-${kind}`);
  }

  /**
   * Look up a specific interior piece by kind (e.g. "floor-1", "wall-h", "stairs-up").
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
