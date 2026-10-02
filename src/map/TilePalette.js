import { buildBuiltins, isVariantType, titleCase, variantIndexAt } from './TileCatalog.js';

/**
 * A catalog tile or a paint brush. `anyVariant` marks a brush that paints a
 * random variant of its type on each cell.
 * @typedef {{ id: string, type: string, label: string, imageRef: string, custom: boolean, anyVariant?: boolean }} PaletteEntry
 */

/** Id prefix of a random-variant brush. */
const ANY_PREFIX = 'any:';

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
   * The variant of a terrain type for the cell at (x, y). A type with
   * built-in variants gets a pick from a hash of the position
   * (`variantIndexAt`). With no custom tile of the type, this is the pick of
   * `variantIdAt`, which the tile codec stores as the type alone. Any other
   * type gets a random variant from `rng`. The function draws from `rng`
   * once in both cases, so the draws after it, and the rest of a seeded
   * world with them, do not depend on which rule picked the variant.
   * @param {string} type
   * @param {number} x
   * @param {number} y
   * @param {() => number} rng returns a float in [0, 1)
   * @returns {PaletteEntry}
   */
  variantAt(type, x, y, rng) {
    const draw = rng();
    if (!isVariantType(type)) return this.pickVariant(type, () => draw);
    const variants = this.listVariants(type);
    return variants[variantIndexAt(variants.length, x, y)];
  }

  /**
   * A brush that paints a random variant of a terrain type. The entry is not
   * in the catalog. Its id has the `any:` prefix, so it cannot collide with a
   * real tile id. Its imageRef is the first variant, which the palette shows
   * as the swatch art. Returns undefined for a type without variants.
   * @param {string} type
   * @returns {PaletteEntry | undefined}
   */
  anyVariant(type) {
    if (!isVariantType(type)) return undefined;
    const [first] = this.listVariants(type);
    return {
      id: `${ANY_PREFIX}${type}`,
      type,
      label: titleCase(type),
      imageRef: first.imageRef,
      custom: false,
      anyVariant: true,
    };
  }

  /**
   * One random-variant brush for each terrain type with variants, in catalog
   * order.
   * @returns {PaletteEntry[]}
   */
  listAnyVariants() {
    const types = new Set([...this.entries.values()].map((e) => e.type));
    return [...types].flatMap((type) => this.anyVariant(type) ?? []);
  }

  /**
   * Look up a brush by id. The id is a catalog id, or the `any:` id of a
   * random-variant brush. A swatch drag sends this id to the drop target.
   * @param {string} id
   * @returns {PaletteEntry | undefined}
   */
  brushById(id) {
    if (id.startsWith(ANY_PREFIX)) return this.anyVariant(id.slice(ANY_PREFIX.length));
    return this.get(id);
  }

  /**
   * The name that the Tile inspector shows for a tile image. A terrain with
   * variants gets the name of its type ("Grass"), the same name as its
   * palette swatch, because the variant number means nothing to the GM. Any
   * other image gets the label of its entry. An image with no entry, such as
   * a custom image that the GM removed, gets null.
   * @param {string} imageRef
   * @returns {string | null}
   */
  artName(imageRef) {
    for (const entry of this.entries.values()) {
      if (entry.imageRef !== imageRef) continue;
      return isVariantType(entry.type) ? titleCase(entry.type) : entry.label;
    }
    return null;
  }

  /**
   * The image that the cell at (x, y) gets from a brush. A random-variant
   * brush paints the variant that `variantAt` picks for the position, so a
   * stroke across several cells mixes the variants, and a painted field
   * stores as one run of its type. Any other brush paints its own image.
   * @param {PaletteEntry} entry
   * @param {number} x
   * @param {number} y
   * @returns {string}
   */
  imageFor(entry, x, y) {
    return entry.anyVariant
      ? this.variantAt(entry.type, x, y, Math.random).imageRef
      : entry.imageRef;
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
   * Look up a dock piece by kind, for example "pier-v", "pier-head-n", or
   * "quay-e".
   * @param {string} kind
   * @returns {PaletteEntry | undefined}
   */
  getDockPiece(kind) {
    return this.entries.get(`dock-${kind}`);
  }

  /**
   * Look up a town wall piece by kind, for example "wall-h",
   * "wall-corner-se", or "gate-v".
   * @param {string} kind
   * @returns {PaletteEntry | undefined}
   */
  getTownWallPiece(kind) {
    return this.entries.get(`town-${kind}`);
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
