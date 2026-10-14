import { tileIdAt } from '../map/MapGeometry.js';
import { MAX_GRID_CELLS } from '../map/TileIndex.js';
import { markDefaulted, overlayRefOf, plainTile, withTileDefaults } from '../map/NodeDefaults.js';
import { artReader, mapOverlay, readArt } from './TileRefs.js';
import { expandFog, expandIndexRuns } from './RunLength.js';

/**
 * The read half of the positional tile encoding that `TileCodec.js`
 * describes. This module is pure.
 */

/** @typedef {import('../types/map.js').Tile} Tile */
/** @typedef {import('./TileRefs.js').LiveArt} LiveArt */

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
 * A ref as stored, for a decode that restores nothing.
 * @param {string} ref
 * @returns {string}
 */
const keepRef = (ref) => ref;

/**
 * A decoded node, and whether every image ref came through `restoreRef`
 * unchanged.
 * @typedef {{ node: Record<string, any>, refsKept: boolean }} Decoded
 */

/**
 * A node read back out of its positional form, or the node unchanged when it
 * is not in that form. The function checks for a `cells` array to decide, so
 * a node in the per-tile form passes through unchanged. This function is
 * pure.
 *
 * The tiles this function returns have every field filled in, in the form
 * `withTileDefaults` returns. A tile with no leftover record comes from
 * `plainTile`, and a tile with one goes through `withTileDefaults` itself.
 * `markDefaulted` records the list, so `withNodeDefaults` keeps it instead
 * of building each tile a second time. The defaults themselves stay in
 * `map/NodeDefaults.js`.
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
  return decode(node, keepRef).node;
}

/**
 * The decode of `decodeNodeTiles`, with every image ref of the node mapped
 * through `restoreRef` (`Assets.refRestorer`). Most cells share a few art
 * objects (`readArt`), so the function restores and checks the refs of each
 * art object once, and not once per tile.
 * @param {Record<string, any>} node an encoded node
 * @param {(ref: string) => string} restoreRef
 * @returns {Decoded}
 */
function decode(node, restoreRef) {
  let refsKept = true;
  const restore = (/** @type {unknown} */ ref) => {
    if (typeof ref !== 'string') return ref;
    const next = restoreRef(ref);
    if (next !== ref) refsKept = false;
    return next;
  };
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
    const kept = [...leftovers.values()].map((tile) =>
      withTileDefaults(
        /** @type {Tile} */ ({
          ...tile,
          imageRef: restore(tile.imageRef),
          overlayRef: mapOverlay(tile.overlayRef, restore),
        }),
      ),
    );
    decoded.tiles = markDefaulted(kept);
    return { node: decoded, refsKept };
  }
  const width = node.width;
  const readers = Array.isArray(node.refs) ? node.refs.map(artReader) : [];
  const art = expandIndexRuns(node.cells, size);
  const revealed = expandFog(node.fog, size);
  const links = linkStream(node, size);
  /** @type {Map<LiveArt, RestoredArt>} */
  const restored = new Map();
  /** @type {Tile[]} */
  const tiles = [];
  for (let pos = 0; pos < size; pos += 1) {
    const reader = readers[art[pos]];
    if (!reader) continue;
    const x = pos % width;
    const y = (pos - x) / width;
    const entry = readArt(reader, x, y);
    let final = restored.get(entry);
    if (!final) {
      const overlay = mapOverlay(entry.overlay, restore);
      final = {
        imageRef: /** @type {string} */ (restore(entry.imageRef)),
        overlay,
        overlayRef: overlayRefOf(overlay),
      };
      restored.set(entry, final);
    }
    const id = tileIdAt(x, y);
    const extra = leftovers.size ? leftovers.get(id) : undefined;
    const link = links ? links.links[links.at[pos]] : undefined;
    if (extra) {
      tiles.push(leftoverTile(extra, id, final, revealed[pos] === 1, links !== null, link));
      continue;
    }
    const childNodeId = typeof link === 'string' ? link : null;
    tiles.push(plainTile(id, final.imageRef, final.overlayRef, revealed[pos] === 1, childNodeId));
  }
  decoded.tiles = markDefaulted(tiles);
  return { node: decoded, refsKept };
}

/**
 * The art of one palette entry with its refs restored: `overlay` as the
 * entry gives it, and `overlayRef` as `overlayRefOf` reads it.
 * @typedef {{ imageRef: string, overlay: unknown, overlayRef: string | string[] | null }} RestoredArt
 */

/**
 * A decoded tile that has a leftover record, in the form `withTileDefaults`
 * returns. The codec's own fields come after the leftovers so they win. A
 * hand-edited save cannot make a leftover record contradict the palettes or
 * the fog stream.
 * @param {Record<string, any>} extra
 * @param {string} id
 * @param {RestoredArt} art
 * @param {boolean} revealed
 * @param {boolean} hasLinks whether the node has a link stream
 * @param {unknown} link
 * @returns {Tile}
 */
function leftoverTile(extra, id, art, revealed, hasLinks, link) {
  /** @type {Record<string, any>} */
  const tile = { ...extra, id, imageRef: art.imageRef };
  if (art.overlay != null) tile.overlayRef = art.overlay;
  else delete tile.overlayRef;
  if (revealed) tile.revealed = true;
  else delete tile.revealed;
  if (hasLinks) {
    if (typeof link === 'string') tile.childNodeId = link;
    else delete tile.childNodeId;
  }
  return withTileDefaults(/** @type {Tile} */ (tile));
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
 * decoded node and whether every image ref of the node came through
 * `restoreRef` unchanged. Without `restoreRef`, every ref stays as stored.
 * @param {unknown[]} list
 * @param {{
 *   reuse?: (record: Record<string, any>) => Record<string, any> | undefined,
 *   restoreRef?: (ref: string) => string,
 *   onDecode?: (
 *     decoded: Record<string, any>,
 *     record: Record<string, any>,
 *     refsKept: boolean,
 *   ) => void,
 * }} [options]
 * @returns {{ nodes: unknown[], dropped: number, emptied: number }}
 */
export function decodeNodeList(list, { reuse, restoreRef = keepRef, onDecode } = {}) {
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
    const { node: decoded, refsKept } = decode(record, restoreRef);
    onDecode?.(decoded, record, refsKept);
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
