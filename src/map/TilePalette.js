/** @typedef {{ id: string, type: string, label: string, imageRef: string, custom: boolean }} PaletteEntry */

const TILE_ROOT = 'assets/tiles';

/**
 * Terrain types with multiple interchangeable variants, so adjacent tiles of
 * the same type don't look identical. Any variant abuts any other cleanly
 * because they share the same background fill.
 * @type {Record<string, number>}
 */
const VARIANT_COUNTS = { grass: 3, forest: 3, mountain: 3, water: 3, desert: 3 };

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
 * Single-image POI markers with no variants.
 * @type {string[]}
 */
const MARKER_TYPES = ['settlement', 'dungeon'];

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

  for (const type of MARKER_TYPES) {
    entries.push({
      id: type,
      type,
      label: `${type[0].toUpperCase()}${type.slice(1)}`,
      imageRef: `${TILE_ROOT}/${type}/${type}.svg`,
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
