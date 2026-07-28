import { tileIdAt } from '../map/MapGeometry.js';

/**
 * Positional encoding for a node's tiles: the on-disk form that stops writing a
 * tile's identity and art reference once per cell. Pure, and deliberately
 * separate from `SaveManager.js` — this is the one place that knows the encoded
 * shape, so nothing else has to.
 *
 * After the default-omission packing, a tile costs about
 * `{"id":"12,34","imageRef":"assets/tiles/grass/grass-1.svg"}` — 60 characters of
 * which both fields are recoverable from the tile's grid position plus a small
 * per-node palette, and neither is a default any omission rule could reach. Since
 * the node list is the overwhelming majority of a save and grows without bound
 * (authoring adds tiles, and play adds a revealed flag per tile that fog never
 * reclaims), this is the part of the save worth encoding rather than trimming.
 *
 * The encoded node replaces `tiles` with:
 *   - `refs`   the distinct art entries, stated once. An entry is a bare
 *              `imageRef` string, or `[imageRef, overlayRef]` when the tile has an
 *              overlay (itself a ref or a draw-ordered stack).
 *   - `cells`  row-major run-length indices into `refs`; a bare number is one
 *              cell, `[index, count]` a run, and `-1` means no tile at all, which
 *              is what lets a sparse-but-gridded interior encode.
 *   - `fog`    `revealed` as its own alternating run-length stream starting with
 *              an unrevealed run. Separate from the terrain on purpose: it is the
 *              one field play changes, and a reveal is a disc, so it is clustered
 *              and run-lengths handle it extremely well.
 *   - `tiles`  whatever is left over, keyed by id, omitted when empty.
 *
 * Two properties keep the codec unable to lose data. It is opt-in per node:
 * anything the positional assumption is not provably true for is left exactly as
 * the tile packing produced it, because non-grid tile ids are legitimate. And it
 * never *picks* the fields it carries out of line — it deletes the four it
 * represents itself and keeps the remainder, so a `Tile` member added later
 * survives a save even if this module never learns about it, the same way
 * `packTile` does.
 *
 * Like a packed tile, an encoded node exists only inside the serialized string.
 * Nothing in memory may ever hold one: the renderer reads `tile.metadata` without
 * checking, so `decodeNodeTiles` runs at the load seam before any validation.
 */

/**
 * The run length at which `[index, count]` starts paying for itself. `[3,2]` is
 * six characters against `3,3`'s four, so pairing a run of two makes a randomly
 * varied terrain field *larger*; three is where it stops losing.
 */
const RUN_MIN = 3;

/** The reserved `cells` index meaning "no tile at this position". */
const EMPTY = -1;

/**
 * Positions a node may hold before encoding is refused. A node this large cannot
 * be authored or generated, so the cap only exists so a malformed `width` or
 * `height` cannot make the encoder allocate its way out of memory.
 */
const MAX_POSITIONS = 1_000_000;

/**
 * Grid position of a canonical `x,y` tile id within a node, or -1 when the id
 * cannot be encoded positionally. Canonical is stricter than parseable: `"01,2"`
 * parses as (1, 2) but is a different string, and re-encoding it as `"1,2"` would
 * silently rename the tile.
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
 * A tile's art as a palette entry: the bare `imageRef` when it has no overlay,
 * else the pair. Both fields together, rather than two palettes and two index
 * streams, because a tile carries both and splitting them costs more than it
 * saves.
 * @param {Record<string, any>} tile
 * @returns {string | [string, string | string[]]}
 */
function artEntry(tile) {
  const overlay = tile.overlayRef;
  return overlay == null ? tile.imageRef : [tile.imageRef, overlay];
}

/**
 * Lay a node's tiles out by grid position, or null when the node does not
 * qualify for positional encoding: a bad dimension, an id that is not a
 * canonical in-bounds `x,y`, two tiles on one position, or an unreadable
 * `imageRef`. Qualification is conservative on purpose — a node that fails is
 * stored in the per-tile form rather than coerced into the grid.
 * @param {Record<string, any>} node
 * @param {number} width
 * @param {number} height
 * @returns {(Record<string, any> | null)[] | null}
 */
function layOut(node, width, height) {
  const size = width * height;
  if (size > MAX_POSITIONS) return null;
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
 * The run-length index stream for a laid-out node, and the palette it indexes.
 * A trailing run of empties is dropped entirely rather than written, which is
 * most of a sparse interior's stream.
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
  // A trailing empty run carries nothing the decoder cannot infer from the
  // stream simply ending.
  if (runCount && runIndex !== EMPTY) flush();
  return { refs, cells };
}

/**
 * `revealed` as alternating run lengths, starting with an unrevealed run, or an
 * empty list when nothing is revealed. A trailing unrevealed run is dropped, the
 * decoder defaulting every unstated position to fogged.
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
 * The fields of a packed tile the codec does not represent itself, keyed by id —
 * `metadata`, `childNodeId`, `span`, and anything a later `Tile` member adds.
 * Built by deletion rather than by naming the fields to keep, so a field this
 * module has never heard of is carried rather than dropped.
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
 * A packed node in its positional form, or the node unchanged when it does not
 * qualify. Pure; the node passed in is never touched.
 *
 * The palette is built by row-major traversal rather than by `tiles` array
 * order, so the output does not depend on the order tile mutations happened to
 * leave the array in. That matters beyond tidiness: the undo ring skips a
 * snapshot byte-identical to the newest and the cross-tab watcher compares raw
 * strings, so re-serializing an unchanged campaign has to produce the same
 * string.
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
  // Deleted and conditionally re-added, so the leftovers land at the end of the
  // record and a node with none carries no `tiles` key at all.
  delete encoded.tiles;
  encoded.refs = refs;
  encoded.cells = cells;
  if (fog.length) encoded.fog = fog;
  if (leftovers.length) encoded.tiles = leftovers;
  return encoded;
}

/**
 * The revealed bit per position, read from an alternating run-length stream.
 * Stops at the first unreadable run rather than throwing: a corrupt fog stream
 * should cost the GM some revealed ground, not the load.
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
 * One `cells` element as an index and a run length, or null when it is neither a
 * bare index nor an `[index, count]` pair.
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
 * A node read back out of its positional form, or the node unchanged when it is
 * not in one — the branch is the presence of a `cells` array, so a save written
 * before this encoding existed passes straight through. Pure.
 *
 * The tiles this returns are still *packed*: their default-valued fields stay
 * omitted, and the load path's existing tile-defaults backfill fills them, so
 * the codec never states what a default is.
 *
 * Every malformed input degrades rather than throwing. A load that throws is
 * worse than a shortened map, and Import persists what it reads before
 * reloading, so an unreadable palette entry skips its cell, an unreadable run
 * ends the stream, and neither invents a tile.
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
  if (!size || size > MAX_POSITIONS) {
    // Nothing can be placed without usable dimensions. Keep the leftovers, which
    // carry their own ids, rather than dropping the node's tiles outright.
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
      // Assigned after the leftovers so the codec's own fields win: a
      // hand-edited save cannot make a leftover record contradict the palette or
      // the fog stream.
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
