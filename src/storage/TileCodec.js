import { tileIdAt } from '../map/MapGeometry.js';
import { MAX_GRID_CELLS } from '../map/TileIndex.js';
import { artReader, mapOverlay, readArt, shortRef } from './TileRefs.js';
import { EMPTY, expandFog, expandIndexRuns, fogRuns, indexRuns } from './RunLength.js';

/**
 * Positional encoding for the tiles of a node. This is the on-disk form. It
 * stores a tile's identity and art reference one time per cell, not once per
 * tile record.
 *
 * This module is pure. It stays separate from `SaveManager.js`. This module
 * is the only place that knows the encoded shape.
 *
 * After default-omission packing, a tile costs about
 * `{"id":"12,34","imageRef":"assets/tiles/grass/grass-1.svg"}` (60 characters).
 * The encoder can recover both fields from the tile's grid position and a
 * small per-node palette. Neither field is a default that an omission rule
 * can remove. The node list is the largest part of a save. It grows without
 * limit: authoring adds tiles, and play adds a revealed flag to each tile
 * that fog never removes. This makes the node list the part of the save
 * worth encoding, not trimming.
 *
 * The encoded node replaces `tiles` with these fields:
 *   - `refs`   the distinct art entries, stated one time. An entry is a bare
 *              `imageRef` string, or the pair `[imageRef, overlayRef]` when
 *              the tile has an overlay. An overlay is a ref or a stack in
 *              draw order. Every ref is in its short form, so built-in art
 *              is a palette id such as `grass-1` (see `TileRefs.js`).
 *   - `cells`  row-major run-length indices into `refs`. A bare number is one
 *              cell. `[index, count]` is a run. `-1` means no tile at that
 *              position. This lets the codec encode a sparse but gridded
 *              interior.
 *   - `fog`    the `revealed` field as its own alternating run-length stream,
 *              starting with an unrevealed run. The codec keeps this separate
 *              from the terrain data because play changes only this field,
 *              and a reveal covers a disc-shaped area, so run-length
 *              encoding works well for it. Absent when nothing is revealed.
 *   - `links`  the distinct `childNodeId` values, and `linkCells`, the index
 *              of each position into `links` in the form of `cells`. A
 *              region link covers a whole block of tiles, so one run states
 *              a row of the block. Both are absent when no tile has a link.
 *   - `tiles`  the fields that remain, keyed by tile id. The codec omits this
 *              field when it is empty.
 *
 * Two properties stop the codec from losing data. First, encoding is opt-in
 * per node: when the positional assumption does not provably hold, the codec
 * leaves the node exactly as the tile packing produced it, because non-grid
 * tile ids are legitimate. Second, the codec never picks the fields it
 * keeps by name. It deletes the fields it represents itself and keeps the
 * remainder. This way, a `Tile` member added later stays in a save even when
 * this module does not know about it, the same way `packTile` works.
 *
 * Like a packed tile, an encoded node exists only inside the serialized
 * string. Nothing in memory can have one: the renderer reads `tile.metadata`
 * without a check, so `decodeNodeTiles` runs on load before any validation.
 * An encoded node depends on nothing outside itself, so one node decodes
 * alone.
 */

/**
 * The value of `text[start, end)` read as a canonical decimal integer, or -1
 * when it is not one. Canonical means digits only, at least one digit, and
 * no leading zero except for "0" itself. The function reads character codes
 * directly. A regular expression plus a `Number` and `String` round trip
 * costs more than the rest of the encode for a large node, and this runs
 * once per tile on every save that touches the node.
 * @param {string} text
 * @param {number} start
 * @param {number} end
 * @returns {number}
 */
function canonicalInt(text, start, end) {
  if (end <= start) return -1;
  if (end - start > 1 && text.charCodeAt(start) === 48) return -1;
  let value = 0;
  for (let i = start; i < end; i += 1) {
    const digit = text.charCodeAt(i) - 48;
    if (digit < 0 || digit > 9) return -1;
    value = value * 10 + digit;
  }
  return value;
}

/**
 * The grid position of a canonical `x,y` tile id within a node, or -1 when
 * the codec cannot encode the id by position. Canonical is stricter than
 * parseable. For example, `"01,2"` parses as (1, 2) but is a different
 * string. Re-encoding it as `"1,2"` silently renames the tile.
 * @param {string} id
 * @param {number} width
 * @param {number} height
 * @returns {number}
 */
function positionOf(id, width, height) {
  const comma = id.indexOf(',');
  if (comma < 0) return -1;
  const x = canonicalInt(id, 0, comma);
  const y = canonicalInt(id, comma + 1, id.length);
  if (x < 0 || y < 0 || x >= width || y >= height) return -1;
  return y * width + x;
}

/**
 * A tile's art as one palette entry: the bare `imageRef` when the tile has no
 * overlay, or the pair otherwise. The codec keeps both fields together
 * instead of using two palettes and two index streams, because a tile
 * has both fields, and splitting them costs more than it saves. Each ref is
 * in its short form for the cell (`TileRefs.js`).
 * @param {Record<string, any>} tile
 * @param {number} x
 * @param {number} y
 * @param {boolean} usePick whether a variant may store as its family
 * @returns {string | [string, unknown]}
 */
function artEntry(tile, x, y, usePick) {
  const overlay = tile.overlayRef;
  const base = shortRef(tile.imageRef, x, y, usePick);
  return overlay == null
    ? base
    : [base, mapOverlay(overlay, (/** @type {string} */ ref) => shortRef(ref, x, y, usePick))];
}

/**
 * Lay a node's tiles out by grid position, or return null when the node does
 * not qualify for positional encoding. A node fails to qualify when it has a
 * bad dimension, an id that is not a canonical in-bounds `x,y` pair, two
 * tiles at one position, or an unreadable `imageRef`. Qualification is
 * deliberately strict: a node that fails is stored in the per-tile form
 * instead of forced into the grid.
 * @param {Record<string, any>} node
 * @param {number} width
 * @param {number} height
 * @returns {(Record<string, any> | null)[] | null}
 */
function layOut(node, width, height) {
  const size = width * height;
  if (size > MAX_GRID_CELLS) return null;
  /** @type {(Record<string, any> | null)[]} */
  const slots = new Array(size).fill(null);
  for (const tile of node.tiles) {
    if (!tile || typeof tile !== 'object') return null;
    if (typeof tile.id !== 'string' || typeof tile.imageRef !== 'string') return null;
    const pos = positionOf(tile.id, width, height);
    if (pos < 0 || slots[pos] !== null) return null;
    slots[pos] = tile;
  }
  return slots;
}

/**
 * A palette of distinct values, indexed in first-seen order, and the index
 * of each position. A position with no value gets `EMPTY`.
 * @template T
 * @param {(Record<string, any> | null)[]} slots
 * @param {(tile: Record<string, any>, pos: number) => T | undefined} valueOf the value of
 *   a tile, or undefined for none
 * @param {(value: T) => string} keyOf the palette key of a value
 * @returns {{ palette: T[], indices: Int32Array }}
 */
function paletteOf(slots, valueOf, keyOf) {
  /** @type {T[]} */
  const palette = [];
  /** @type {Map<string, number>} */
  const seen = new Map();
  const indices = new Int32Array(slots.length).fill(EMPTY);
  for (let pos = 0; pos < slots.length; pos += 1) {
    const tile = slots[pos];
    const value = tile ? valueOf(tile, pos) : undefined;
    if (value === undefined) continue;
    const key = keyOf(value);
    let index = seen.get(key);
    if (index === undefined) {
      index = palette.length;
      palette.push(value);
      seen.set(key, index);
    }
    indices[pos] = index;
  }
  return { palette, indices };
}

/**
 * The palette key of an art entry. A bare entry is keyed by its own string,
 * so the common case builds no key at all. A pair is keyed by its JSON text,
 * which starts with `[`. The `\u0000` prefix of a bare key keeps a bare ref
 * that looks like the JSON of a pair out of that pair's palette slot.
 * @param {string | [string, unknown]} entry
 * @returns {string}
 */
function artKey(entry) {
  return typeof entry === 'string' ? `\u0000${entry}` : JSON.stringify(entry);
}

/**
 * The region link of a tile, or undefined when it has none. A link that is
 * not a string stays in the leftover record, the same as an unknown field.
 * @param {Record<string, any>} tile
 * @returns {string | undefined}
 */
function linkOf(tile) {
  return typeof tile.childNodeId === 'string' ? tile.childNodeId : undefined;
}

/**
 * The fields of a packed tile that the codec does not represent itself,
 * keyed by id: `metadata`, `span`, and any field a later `Tile` member adds.
 * The codec builds this list by deletion, not by naming the fields to keep,
 * so a field unknown to this module stays in the save.
 * @param {(Record<string, any> | null)[]} slots
 * @returns {Record<string, any>[]}
 */
function encodeLeftovers(slots) {
  /** @type {Record<string, any>[]} */
  const leftovers = [];
  for (const tile of slots) {
    if (!tile) continue;
    // Most tiles have nothing but the fields the codec owns. Count those
    // fields first, and copy the tile only when it has something else.
    // `layOut` has already checked that `id` and `imageRef` are present.
    let owned = 2;
    if ('overlayRef' in tile) owned += 1;
    if ('revealed' in tile) owned += 1;
    const link = linkOf(tile) !== undefined;
    if (link) owned += 1;
    if (Object.keys(tile).length === owned) continue;
    /** @type {Record<string, any>} */
    const rest = { ...tile };
    delete rest.id;
    delete rest.imageRef;
    delete rest.overlayRef;
    delete rest.revealed;
    if (link) delete rest.childNodeId;
    if (Object.keys(rest).length) leftovers.push({ id: tile.id, ...rest });
  }
  return leftovers;
}

/**
 * A packed node in its positional form, or the node unchanged when it does
 * not qualify. This function is pure: it never changes the node passed in.
 *
 * The codec builds each palette by row-major traversal, not by the order of
 * the `tiles` array, so the output does not depend on the order that tile
 * mutations leave the array in. The undo log skips a save string equal to
 * the one before it, and the cross-tab follower compares raw strings, so a
 * palette in array order makes an unchanged campaign read as a new save.
 * @param {Record<string, any>} node a node whose tiles are already packed
 * @returns {Record<string, any>}
 */
export function encodeNodeTiles(node) {
  if (!node || typeof node !== 'object' || !Array.isArray(node.tiles)) return node;
  const width = node.width;
  const height = node.height;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) return node;
  const slots = layOut(node, width, height);
  if (!slots) return node;
  // A cell whose variant equals the position pick has two stored forms, its
  // family and its id. The encoder takes the id when the cell before it
  // stored the same id, so a field painted with one fixed variant stays one
  // run instead of breaking wherever the pick matches.
  let previous = '';
  const art = paletteOf(
    slots,
    (tile, pos) => {
      const x = pos % width;
      const y = (pos / width) | 0;
      const fixed = artEntry(tile, x, y, false);
      const value = artKey(fixed) === previous ? fixed : artEntry(tile, x, y, true);
      previous = artKey(value);
      return value;
    },
    artKey,
  );
  const links = paletteOf(slots, linkOf, (id) => id);
  const fog = fogRuns(slots.map((tile) => tile !== null && tile.revealed === true));
  const leftovers = encodeLeftovers(slots);
  /** @type {Record<string, any>} */
  const encoded = { ...node };
  // The codec deletes this field, then adds it back only when needed. This
  // puts the leftovers at the end of the record, and a node with no
  // leftovers has no `tiles` key.
  delete encoded.tiles;
  encoded.refs = art.palette;
  encoded.cells = indexRuns(art.indices);
  if (fog.length) encoded.fog = fog;
  if (links.palette.length) {
    encoded.links = links.palette;
    encoded.linkCells = indexRuns(links.indices);
  }
  if (leftovers.length) encoded.tiles = leftovers;
  return encoded;
}

/**
 * The leftover records of an encoded node, keyed by tile id.
 * @param {unknown} tiles
 * @returns {Map<string, Record<string, any>>}
 */
function leftoversById(tiles) {
  /** @type {Map<string, Record<string, any>>} */
  const byId = new Map();
  if (!Array.isArray(tiles)) return byId;
  for (const tile of tiles) {
    if (tile && typeof tile === 'object' && typeof tile.id === 'string') byId.set(tile.id, tile);
  }
  return byId;
}

/**
 * The link palette and index of each position, or null when the node has no
 * link stream. A save that keeps links in the leftover records has none.
 * @param {Record<string, any>} node
 * @param {number} size
 * @returns {{ links: unknown[], at: Int32Array } | null}
 */
function linkStream(node, size) {
  if (!Array.isArray(node.links)) return null;
  return { links: node.links, at: expandIndexRuns(node.linkCells, size) };
}

/**
 * A node read back out of its positional form, or the node unchanged when it
 * is not in that form. The function checks for a `cells` array to decide, so
 * a node in the per-tile form passes through unchanged. This function is
 * pure.
 *
 * The tiles this function returns are still packed: their default-valued
 * fields stay omitted. The load path's existing tile-defaults step fills
 * them in, so the codec never states what a default value is.
 *
 * Every malformed input degrades instead of throwing an error. A load that
 * throws is worse than a shortened map. Import saves what it reads before it
 * reloads, so an unreadable palette entry skips its cell, and an unreadable
 * run ends the stream. Neither case invents a tile.
 * @param {Record<string, any>} node
 * @returns {Record<string, any>}
 */
export function decodeNodeTiles(node) {
  if (!node || typeof node !== 'object' || !Array.isArray(node.cells)) return node;
  /** @type {Record<string, any>} */
  const decoded = { ...node };
  delete decoded.refs;
  delete decoded.cells;
  delete decoded.fog;
  delete decoded.links;
  delete decoded.linkCells;
  const leftovers = leftoversById(node.tiles);
  const size = gridSize(node);
  if (!size) {
    // The codec cannot place a tile without usable dimensions. Keep the
    // leftovers, which have their own ids, instead of dropping the node's
    // tiles outright.
    decoded.tiles = [...leftovers.values()];
    return decoded;
  }
  const width = node.width;
  const readers = Array.isArray(node.refs) ? node.refs.map(artReader) : [];
  const art = expandIndexRuns(node.cells, size);
  const revealed = expandFog(node.fog, size);
  const links = linkStream(node, size);
  /** @type {Record<string, any>[]} */
  const tiles = [];
  for (let pos = 0; pos < size; pos += 1) {
    const reader = readers[art[pos]];
    if (!reader) continue;
    const x = pos % width;
    const y = (pos - x) / width;
    const entry = readArt(reader, x, y);
    const id = tileIdAt(x, y);
    const extra = leftovers.size ? leftovers.get(id) : undefined;
    // The codec's own fields come after the leftovers so they win. A
    // hand-edited save cannot make a leftover record contradict the
    // palettes or the fog stream.
    /** @type {Record<string, any>} */
    const tile = extra
      ? { ...extra, id, imageRef: entry.imageRef }
      : { id, imageRef: entry.imageRef };
    if (entry.overlay != null) tile.overlayRef = entry.overlay;
    else if (extra) delete tile.overlayRef;
    if (revealed[pos]) tile.revealed = true;
    else if (extra) delete tile.revealed;
    if (links) {
      const link = links.links[links.at[pos]];
      if (typeof link === 'string') tile.childNodeId = link;
      else if (extra) delete tile.childNodeId;
    }
    tiles.push(tile);
  }
  decoded.tiles = tiles;
  return decoded;
}

/**
 * Total cell limit summed over every encoded node of one save. A run of
 * `[index, count]` costs a few characters in the file and one tile record
 * in memory per cell, so a 192-character node with one 1000x1000 run
 * allocates about 283 MB when it loads. The per-node `MAX_GRID_CELLS` limit
 * alone lets a file repeat that node until the tab runs out of memory.
 */
export const MAX_TOTAL_CELLS = 2_000_000;

/** Node count limit for one save. Nodes past this index are dropped. */
export const MAX_NODES = 10_000;

/**
 * Decode every node of a save with `decodeNodeTiles`, under the
 * `MAX_NODES` and `MAX_TOTAL_CELLS` limits. The function counts an encoded
 * node's declared grid size against the cell limit. A node that does not
 * fit in the cells left keeps its other fields and loads with no tiles, so
 * links to it still resolve. A node in the per-tile form costs its file
 * size in memory and does not count.
 *
 * `dropped` counts the nodes past `MAX_NODES`, and `emptied` counts the
 * nodes that load with no tiles because of the cell limit. The load path
 * reports both, because the next save stores the shortened map.
 *
 * `reuse` names a live node that an encoded record encodes unchanged, and
 * the list then keeps that node in place of a decode. The node counts
 * against the cell limit like a decode, so a list loads the same nodes
 * either way. `onDecode` sees each record that decodes in full, beside its
 * decoded node.
 * @param {unknown[]} list
 * @param {{
 *   reuse?: (record: Record<string, any>) => Record<string, any> | undefined,
 *   onDecode?: (decoded: Record<string, any>, record: Record<string, any>) => void,
 * }} [options]
 * @returns {{ nodes: unknown[], dropped: number, emptied: number }}
 */
export function decodeNodeList(list, { reuse, onDecode } = {}) {
  let left = MAX_TOTAL_CELLS;
  let emptied = 0;
  const nodes = list.slice(0, MAX_NODES).map((node) => {
    const record = /** @type {Record<string, any>} */ (node);
    if (!record || typeof record !== 'object' || !Array.isArray(record.cells)) return node;
    const size = gridSize(record);
    if (size > left) {
      emptied += 1;
      return decodeNodeTiles({ ...record, cells: [], tiles: [] });
    }
    left -= size;
    const live = reuse?.(record);
    if (live) return live;
    const decoded = decodeNodeTiles(record);
    onDecode?.(decoded, record);
    return decoded;
  });
  return { nodes, dropped: list.length - nodes.length, emptied };
}

/**
 * The cell count of an encoded node, or 0 when a dimension is not a
 * positive integer or the grid exceeds `MAX_GRID_CELLS`.
 * @param {Record<string, any>} node
 * @returns {number}
 */
function gridSize(node) {
  const { width, height } = node;
  if (!Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1) return 0;
  const size = width * height;
  return size > MAX_GRID_CELLS ? 0 : size;
}
