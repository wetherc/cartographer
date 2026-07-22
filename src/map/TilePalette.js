/** @typedef {{ id: string, label: string, imageRef: string, custom: boolean }} PaletteEntry */

/**
 * Built-in tile catalog. imageRef points at bundled SVG assets under assets/tiles/.
 * @type {PaletteEntry[]}
 */
const BUILTIN_TILES = [
  { id: 'grass', label: 'Grass', imageRef: 'assets/tiles/grass.svg', custom: false },
  { id: 'forest', label: 'Forest', imageRef: 'assets/tiles/forest.svg', custom: false },
  { id: 'mountain', label: 'Mountain', imageRef: 'assets/tiles/mountain.svg', custom: false },
  { id: 'water', label: 'Water', imageRef: 'assets/tiles/water.svg', custom: false },
  { id: 'desert', label: 'Desert', imageRef: 'assets/tiles/desert.svg', custom: false },
  { id: 'settlement', label: 'Settlement', imageRef: 'assets/tiles/settlement.svg', custom: false },
  { id: 'dungeon', label: 'Dungeon', imageRef: 'assets/tiles/dungeon.svg', custom: false },
  { id: 'road', label: 'Road', imageRef: 'assets/tiles/road.svg', custom: false },
];

/**
 * Holds the built-in tile catalog plus any user-supplied custom tile images,
 * keyed by id so callers can look up an imageRef when placing a tile.
 */
export class TilePalette {
  constructor() {
    /** @type {Map<string, PaletteEntry>} */
    this.entries = new Map(BUILTIN_TILES.map((entry) => [entry.id, entry]));
  }

  /**
   * Register a custom tile image (e.g. a data: URL read from a file input).
   * Throws if the id collides with an existing built-in entry.
   * @param {string} id
   * @param {string} label
   * @param {string} imageRef
   * @returns {PaletteEntry}
   */
  addCustom(id, label, imageRef) {
    const existing = this.entries.get(id);
    if (existing && !existing.custom) {
      throw new Error(`Cannot override built-in tile "${id}"`);
    }
    const entry = { id, label, imageRef, custom: true };
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
