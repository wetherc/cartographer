import {
  buildBuiltins,
  variantCount,
  variantFamilyOf,
  variantIdAt,
  variantIndexAt,
} from '../map/TileCatalog.js';

/**
 * The short form of a tile art ref inside an encoded node. The tile codec
 * (`TileCodec.js`) writes each palette string through `shortRef` and reads it
 * back through `fullRef`, both with the position of the cell. This module
 * is pure.
 *
 * A built-in tile ref is a path such as `assets/tiles/snow/snow-3.svg`, and
 * the example campaign repeats a few hundred of these paths in thousands of
 * node palettes. Each built-in palette id equals the file's base name
 * (`snow-3`), so the codec writes the id instead, at about a third of the
 * length, and reads a palette id back as its path.
 *
 * A variant, such as a terrain variant or an interior floor variant, goes
 * one step further. When a cell's variant is the one that `variantIdAt`
 * picks for its position, the codec writes only the family (`snow`), and
 * the decoder picks the same variant again. The generators and the
 * random-variant brush paint that pick, so a field of mixed variants stores
 * as one palette entry and one run. A variant that the GM paints on purpose
 * and that differs from the pick keeps its id.
 *
 * A ref with a `/` or a `:` passes through both ways. This covers a path
 * that is not in the catalog, an `asset:` key, and a `data:` payload. A
 * short form has neither character, so a stored short form never reads as
 * one of these refs.
 *
 * A live ref with neither character is a bare ref. The tile art never uses
 * one, but a hand-edited file or a test fixture can. Without an escape, a
 * bare live ref `grass-1` reads back as the path of `grass-1`. So a bare ref
 * that reads as a short form (a palette id, a variant family, or a ref
 * that starts with `=`) gets a `=` prefix, and `fullRef` strips it. Any
 * other bare ref, such as `lava`, stays as written.
 */

/** The prefix of an escaped bare ref. */
const ESCAPE = '=';

/**
 * The lookup tables of the built-in catalog, built on first use. The catalog
 * is fixed for the life of the page, so one build serves every save.
 * @type {{ idByPath: Map<string, string>, pathById: Map<string, string>, familyById: Map<string, string> } | null}
 */
let tables = null;

function catalog() {
  if (!tables) {
    const idByPath = new Map();
    const pathById = new Map();
    const familyById = new Map();
    for (const entry of buildBuiltins()) {
      idByPath.set(entry.imageRef, entry.id);
      pathById.set(entry.id, entry.imageRef);
      const family = variantFamilyOf(entry.id);
      if (family !== undefined) familyById.set(entry.id, family);
    }
    tables = { idByPath, pathById, familyById };
  }
  return tables;
}

/**
 * Whether a ref has neither a `/` nor a `:`, the form of a short ref.
 * @param {string} ref
 * @returns {boolean}
 */
function isBare(ref) {
  return !ref.includes('/') && !ref.includes(':');
}

/**
 * The stored form of one live art ref at the cell (x, y). With `usePick`
 * false, a variant keeps its palette id even where it equals the pick.
 * @param {string} ref
 * @param {number} x
 * @param {number} y
 * @param {boolean} [usePick]
 * @returns {string}
 */
export function shortRef(ref, x, y, usePick = true) {
  const { idByPath, pathById, familyById } = catalog();
  const id = idByPath.get(ref);
  if (id !== undefined) {
    const family = familyById.get(id);
    return usePick && family !== undefined && variantIdAt(family, x, y) === id ? family : id;
  }
  if (isBare(ref) && (ref.startsWith(ESCAPE) || pathById.has(ref) || variantCount(ref) > 0)) {
    return ESCAPE + ref;
  }
  return ref;
}

/**
 * Whether a stored ref reads differently at different cells: a variant
 * family, whose variant the decoder picks per position.
 * @param {unknown} ref
 * @returns {boolean}
 */
export function variesByCell(ref) {
  return typeof ref === 'string' && variantCount(ref) > 0;
}

/**
 * The live form of one stored art ref at the cell (x, y). A value that is
 * not a string passes through, so the decoder's own check still skips it.
 * @param {unknown} ref
 * @param {number} x
 * @param {number} y
 * @returns {unknown}
 */
export function fullRef(ref, x, y) {
  if (typeof ref !== 'string' || !isBare(ref)) return ref;
  if (ref.startsWith(ESCAPE)) return ref.slice(ESCAPE.length);
  const { pathById } = catalog();
  const id = variantIdAt(ref, x, y) ?? ref;
  return pathById.get(/** @type {string} */ (id)) ?? ref;
}

/**
 * An overlay (a ref or a stack of refs) with `map` applied to each ref.
 * Anything else passes through.
 * @template T
 * @param {unknown} overlay
 * @param {(ref: any) => T} map
 * @returns {unknown}
 */
export function mapOverlay(overlay, map) {
  if (typeof overlay === 'string') return map(overlay);
  return Array.isArray(overlay) ? overlay.map(map) : overlay;
}

/** @typedef {{ imageRef: string, overlay: unknown }} LiveArt */

/**
 * A palette entry of an encoded node, prepared for reading at many cells.
 * Every reader has the same fields, so the decode loop sees one hidden class
 * and makes no closure call per cell.
 *   - `fixed`     the live art, when the entry reads the same at every cell.
 *   - `count`     the variant count of a family base under a fixed overlay.
 *                 `byVariant` keeps one live object per variant, because a
 *                 large map has tens of thousands of such cells.
 *   - `perCell`   true when the overlay itself has a family. The reader then
 *                 resolves every ref at each cell. No generator paints this.
 *   - `overlay`   the overlay in its live form, or in its stored form when
 *                 `perCell` is true.
 * @typedef {{ fixed: LiveArt | null, base: string, count: number, overlay: unknown, byVariant: LiveArt[], perCell: boolean }} ArtReader
 */

/**
 * The live form of a stored ref that reads the same at every cell.
 * @param {string} ref
 * @returns {string}
 */
function liveRef(ref) {
  return /** @type {string} */ (fullRef(ref, 0, 0));
}

/**
 * The reader of one stored palette entry, or null when its base ref is not
 * a string. The decoder skips a cell whose reader is null.
 * @param {unknown} entry a bare ref, or the pair `[imageRef, overlay]`
 * @returns {ArtReader | null}
 */
export function artReader(entry) {
  const pair = Array.isArray(entry);
  const base = pair ? entry[0] : entry;
  if (typeof base !== 'string') return null;
  const overlay = pair ? entry[1] : null;
  const perCell = Array.isArray(overlay) ? overlay.some(variesByCell) : variesByCell(overlay);
  const liveOverlay = perCell ? overlay : mapOverlay(overlay, liveRef);
  const count = perCell ? 0 : variantCount(base);
  /** @type {ArtReader} */
  const reader = { fixed: null, base, count, overlay: liveOverlay, byVariant: [], perCell };
  if (!perCell && count === 0) reader.fixed = { imageRef: liveRef(base), overlay: liveOverlay };
  return reader;
}

/**
 * The live art of a reader at the cell (x, y). A fixed or per-variant read
 * returns a shared object, which the decoder only reads.
 * @param {ArtReader} reader
 * @param {number} x
 * @param {number} y
 * @returns {LiveArt}
 */
export function readArt(reader, x, y) {
  if (reader.fixed !== null) return reader.fixed;
  if (reader.perCell) {
    return {
      imageRef: /** @type {string} */ (fullRef(reader.base, x, y)),
      overlay: mapOverlay(reader.overlay, (ref) => fullRef(ref, x, y)),
    };
  }
  const n = variantIndexAt(reader.count, x, y);
  return (reader.byVariant[n] ??= {
    imageRef: liveRef(`${reader.base}-${n + 1}`),
    overlay: reader.overlay,
  });
}
