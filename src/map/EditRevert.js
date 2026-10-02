import { getTile, tilesById } from './TileGrid.js';
import { withNodeTiles } from './TileIndex.js';

/** @typedef {import('../types/map.js').MapNode} MapNode */
/** @typedef {import('../types/map.js').Tile} Tile */

/**
 * The tile fields an edit can change, apart from the metadata record. A
 * stroke-undo writes back only the fields whose value differs between the
 * node before the edit and the node after it.
 * @type {readonly ('imageRef' | 'overlayRef' | 'span' | 'childNodeId' | 'revealed')[]}
 */
const TILE_FIELDS = ['imageRef', 'overlayRef', 'span', 'childNodeId', 'revealed'];

/** @type {readonly (keyof import('../types/map.js').TileMetadata)[]} */
const METADATA_FIELDS = ['poiType', 'discoverable', 'discovered', 'notes'];

/**
 * Whether two field values are equal. An overlay stack is an array, so two
 * stacks with the same refs in the same order are equal.
 * @param {unknown} a
 * @param {unknown} b
 */
function same(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

/**
 * The current tile with each field that the edit changed set back to its
 * value before the edit. Every other field keeps its current value. Returns
 * the current tile itself when the edit changed no field.
 * @param {Tile} current
 * @param {Tile} before
 * @param {Tile} after
 * @returns {Tile}
 */
function revertTile(current, before, after) {
  /** @type {Record<string, unknown>} */
  const patch = {};
  for (const field of TILE_FIELDS) {
    if (!same(before[field], after[field])) patch[field] = before[field];
  }
  /** @type {Record<string, unknown>} */
  const metadata = {};
  for (const field of METADATA_FIELDS) {
    if (before.metadata[field] !== after.metadata[field]) metadata[field] = before.metadata[field];
  }
  const metadataChanged = Object.keys(metadata).length > 0;
  if (!metadataChanged && Object.keys(patch).length === 0) return current;
  const next = /** @type {Tile} */ ({
    ...current,
    ...patch,
    metadata: metadataChanged ? { ...current.metadata, ...metadata } : current.metadata,
  });
  // A tile with no span draws one cell, and the field stays absent then.
  if (next.span === undefined) delete next.span;
  return next;
}

/**
 * Undo one edit on a node, cell by cell. `before` and `after` are the node
 * as the edit found it and as the edit left it. `current` is the node as it
 * stands now, which can hold later changes: fog reveals, discovered points
 * of interest, inspector notes, or another tab's adopted save. Only the
 * fields that the edit changed go back to their `before` values, so those
 * later changes stay. A tile the edit created is removed, and a tile the
 * edit erased comes back as it was. Node fields such as the width and the
 * name follow the same rule.
 *
 * With no `after` record (the edit never finished), the node goes back to
 * `before` whole.
 * @param {MapNode} current
 * @param {MapNode} before
 * @param {MapNode | null} after
 * @returns {MapNode}
 */
export function revertEdit(current, before, after) {
  if (!after) return before;
  /** @type {Record<string, unknown>} */
  const fields = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const field = /** @type {keyof MapNode} */ (key);
    if (field !== 'tiles' && !same(before[field], after[field])) fields[field] = before[field];
  }
  const beforeTiles = tilesById(before.tiles);
  const afterTiles = tilesById(after.tiles);
  /** @type {Set<string>} */
  const dropped = new Set();
  /** @type {Map<string, Tile>} */
  const replaced = new Map();
  for (const id of new Set([...beforeTiles.keys(), ...afterTiles.keys()])) {
    const b = beforeTiles.get(id);
    const a = afterTiles.get(id);
    if (b === a) continue;
    const c = getTile(current, id);
    if (!b) {
      if (c) dropped.add(id);
    } else if (!a || !c) {
      replaced.set(id, b);
    } else {
      const reverted = revertTile(c, b, a);
      if (reverted !== c) replaced.set(id, reverted);
    }
  }
  if (!dropped.size && !replaced.size && !Object.keys(fields).length) return current;
  /** @type {Tile[]} */
  const tiles = [];
  for (const tile of current.tiles) {
    if (dropped.has(tile.id)) continue;
    tiles.push(replaced.get(tile.id) ?? tile);
    replaced.delete(tile.id);
  }
  tiles.push(...replaced.values());
  return withNodeTiles({ ...current, ...fields }, tiles);
}
