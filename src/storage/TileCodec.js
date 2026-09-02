import { tileIdAt } from '../map/MapGeometry.js';
import { MAX_GRID_CELLS } from '../map/TileIndex.js';

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
 * The encoded node replaces `tiles` with four fields:
 *   - `refs`   the distinct art entries, stated one time. An entry is a bare
 *              `imageRef` string, or the pair `[imageRef, overlayRef]` when
 *              the tile has an overlay. An overlay is a ref or a stack in
 *              draw order.
 *   - `cells`  row-major run-length indices into `refs`. A bare number is one
 *              cell. `[index, count]` is a run. `-1` means no tile at that
 *              position. This lets the codec encode a sparse but gridded
 *              interior.
 *   - `fog`    the `revealed` field as its own alternating run-length stream,
 *              starting with an unrevealed run. The codec keeps this separate
 *              from the terrain data because play changes only this field,
 *              and a reveal covers a disc-shaped area, so run-length
 *              encoding works well for it.
 *   - `tiles`  the fields that remain, keyed by tile id. The codec omits this
 *              field when it is empty.
 *
 * Two properties stop the codec from losing data. First, encoding is opt-in
 * per node: when the positional assumption does not provably hold, the codec
 * leaves the node exactly as the tile packing produced it, because non-grid
 * tile ids are legitimate. Second, the codec never picks the fields it
 * carries by name. It deletes the four fields it represents itself and keeps
 * the remainder. This way, a `Tile` member added later survives a save even
 * when this module does not know about it, the same way `packTile` works.
 *
 * Like a packed tile, an encoded node exists only inside the serialized
 * string. Nothing in memory can hold one: the renderer reads `tile.metadata`
 * without a check, so `decodeNodeTiles` must run on load before any
 * validation.
 */

/**
 * The run length at which `[index, count]` becomes shorter than the same run
 * written as bare numbers. `[3,2]` is six characters. `3,3` is four
 * characters. A run of two makes a randomly varied terrain field larger. A
 * run of three is the point where the pair form stops losing.
 */
const RUN_MIN = 3;

/** The reserved `cells` index that means no tile is at this position. */
const EMPTY = -1;

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
  const match = /^(\d+),(\d+)$/.exec(id);
  if (!match) return -1;
  const x = Number(match[1]);
  const y = Number(match[2]);
  if (String(x) !== match[1] || String(y) !== match[2]) return -1;
  if (x >= width || y >= height) return -1;
  return y * width + x;
}

/**
 * A tile's art as one palette entry: the bare `imageRef` when the tile has no
 * overlay, or the pair otherwise. The codec keeps both fields together
 * instead of using two palettes and two index streams, because a tile
 * carries both fields, and splitting them costs more than it saves.
 * @param {Record<string, any>} tile
 * @returns {string | [string, string | string[]]}
 */
function artEntry(tile) {
  const overlay = tile.overlayRef;
  return overlay == null ? tile.imageRef : [tile.imageRef, overlay];
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
 * The run-length index stream for a laid-out node, and the palette that the
 * stream indexes. The codec drops a trailing run of empty cells instead of
 * writing it. This run is most of the stream for a sparse interior.
 * @param {(Record<string, any> | null)[]} slots
 * @returns {{ refs: (string | [string, string | string[]])[], cells: (number | [number, number])[] }}
 */
function encodeCells(slots) {
  /** @type {(string | [string, string | string[]])[]} */
  const refs = [];
  /** @type {Map<string, number>} */
  const indexByKey = new Map();
  /** @type {(number | [number, number])[]} */
  const cells = [];
  let runIndex = EMPTY;
  let runCount = 0;
  const flush = () => {
    if (runCount >= RUN_MIN) cells.push([runIndex, runCount]);
    else for (let n = 0; n < runCount; n += 1) cells.push(runIndex);
  };
  for (const tile of slots) {
    let index = EMPTY;
    if (tile) {
      const entry = artEntry(tile);
      const key = JSON.stringify(entry);
      const seen = indexByKey.get(key);
      if (seen === undefined) {
        index = refs.length;
        refs.push(entry);
        indexByKey.set(key, index);
      } else {
        index = seen;
      }
    }
    if (runCount && index === runIndex) {
      runCount += 1;
      continue;
    }
    if (runCount) flush();
    runIndex = index;
    runCount = 1;
  }
  // A trailing empty run carries no information. The decoder can infer it
  // from the end of the stream.
  if (runCount && runIndex !== EMPTY) flush();
  return { refs, cells };
}

/**
 * The `revealed` field as alternating run lengths, starting with an
 * unrevealed run, or an empty list when nothing is revealed. The codec drops
 * a trailing unrevealed run. The decoder defaults every unstated position to
 * fogged.
 * @param {(Record<string, any> | null)[]} slots
 * @returns {number[]}
 */
function encodeFog(slots) {
  /** @type {number[]} */
  const runs = [];
  let value = false;
  let count = 0;
  let any = false;
  for (const tile of slots) {
    const bit = tile !== null && tile.revealed === true;
    if (bit === value) {
      count += 1;
    } else {
      runs.push(count);
      value = bit;
      count = 1;
    }
    if (bit) any = true;
  }
  if (!any) return [];
  if (value) runs.push(count);
  return runs;
}

/**
 * The fields of a packed tile that the codec does not represent itself,
 * keyed by id: `metadata`, `childNodeId`, `span`, and any field a later
 * `Tile` member adds. The codec builds this list by deletion, not by naming
 * the fields to keep, so a field unknown to this module is carried, not
 * dropped.
 * @param {(Record<string, any> | null)[]} slots
 * @returns {Record<string, any>[]}
 */
function encodeLeftovers(slots) {
  /** @type {Record<string, any>[]} */
  const leftovers = [];
  for (const tile of slots) {
    if (!tile) continue;
    /** @type {Record<string, any>} */
    const rest = { ...tile };
    delete rest.id;
    delete rest.imageRef;
    delete rest.overlayRef;
    delete rest.revealed;
    if (Object.keys(rest).length) leftovers.push({ id: tile.id, ...rest });
  }
  return leftovers;
}

/**
 * A packed node in its positional form, or the node unchanged when it does
 * not qualify. This function is pure: it never changes the node passed in.
 *
 * The codec builds the palette by row-major traversal, not by the order of
 * the `tiles` array, so the output does not depend on the order that tile
 * mutations leave the array in. This matters for more than tidiness. The
 * undo ring skips a snapshot that is byte-identical to the newest one, and
 * the cross-tab watcher compares raw strings. Because of this, re-serializing
 * an unchanged campaign must produce the same string.
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
  const { refs, cells } = encodeCells(slots);
  const fog = encodeFog(slots);
  const leftovers = encodeLeftovers(slots);
  /** @type {Record<string, any>} */
  const encoded = { ...node };
  // The codec deletes this field, then adds it back only when needed. This
  // puts the leftovers at the end of the record, and a node with no
  // leftovers carries no `tiles` key.
  delete encoded.tiles;
  encoded.refs = refs;
  encoded.cells = cells;
  if (fog.length) encoded.fog = fog;
  if (leftovers.length) encoded.tiles = leftovers;
  return encoded;
}

/**
 * The revealed bit for each position, read from an alternating run-length
 * stream. The function stops at the first unreadable run instead of
 * throwing an error. A corrupt fog stream costs the GM some revealed ground,
 * not the entire load.
 * @param {unknown} fog
 * @param {number} size
 * @returns {Uint8Array}
 */
function decodeFog(fog, size) {
  const bits = new Uint8Array(size);
  if (!Array.isArray(fog)) return bits;
  let pos = 0;
  let revealed = false;
  for (const run of fog) {
    if (typeof run !== 'number' || !Number.isFinite(run) || run < 0) break;
    const end = Math.min(size, pos + Math.floor(run));
    if (revealed) bits.fill(1, pos, end);
    pos = end;
    revealed = !revealed;
    if (pos >= size) break;
  }
  return bits;
}

/**
 * One `cells` element as an index and a run length, or null when the element
 * is neither a bare index nor an `[index, count]` pair.
 * @param {unknown} element
 * @returns {{ index: number, count: number } | null}
 */
function readRun(element) {
  if (typeof element === 'number' && Number.isFinite(element)) {
    return { index: Math.trunc(element), count: 1 };
  }
  if (!Array.isArray(element)) return null;
  const [index, count] = element;
  if (typeof index !== 'number' || !Number.isFinite(index)) return null;
  if (typeof count !== 'number' || !Number.isFinite(count)) return null;
  return { index: Math.trunc(index), count: Math.max(0, Math.trunc(count)) };
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
 * A node read back out of its positional form, or the node unchanged when it
 * is not in that form. The function checks for a `cells` array to decide, so
 * a save written before this encoding existed passes through unchanged. This
 * function is pure.
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
  const leftovers = leftoversById(node.tiles);
  const width = Number.isInteger(node.width) && node.width >= 1 ? node.width : 0;
  const height = Number.isInteger(node.height) && node.height >= 1 ? node.height : 0;
  const size = width * height;
  if (!size || size > MAX_GRID_CELLS) {
    // The codec cannot place a tile without usable dimensions. Keep the
    // leftovers, which carry their own ids, instead of dropping the node's
    // tiles outright.
    decoded.tiles = [...leftovers.values()];
    return decoded;
  }
  const refs = Array.isArray(node.refs) ? node.refs : [];
  const revealed = decodeFog(node.fog, size);
  /** @type {Record<string, any>[]} */
  const tiles = [];
  let pos = 0;
  for (const element of node.cells) {
    const run = readRun(element);
    if (!run) break;
    for (let n = 0; n < run.count && pos < size; n += 1, pos += 1) {
      const entry = refs[run.index];
      const pair = Array.isArray(entry);
      const imageRef = pair ? entry[0] : entry;
      if (typeof imageRef !== 'string') continue;
      const x = pos % width;
      const id = tileIdAt(x, (pos - x) / width);
      const extra = leftovers.get(id);
      /** @type {Record<string, any>} */
      const tile = extra ? { ...extra } : {};
      // Assign these fields after the leftovers so the codec's own fields
      // win. A hand-edited save cannot make a leftover record contradict
      // the palette or the fog stream.
      tile.id = id;
      tile.imageRef = imageRef;
      const overlay = pair ? entry[1] : null;
      if (overlay == null) delete tile.overlayRef;
      else tile.overlayRef = overlay;
      if (revealed[pos]) tile.revealed = true;
      else delete tile.revealed;
      tiles.push(tile);
    }
    if (pos >= size) break;
  }
  decoded.tiles = tiles;
  return decoded;
}
