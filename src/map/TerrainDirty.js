/**
 * The grid cells whose terrain pixels can differ between two terrain keys,
 * so the terrain layer repaints only those cells after a party step or a
 * paint stroke, and not the whole view.
 *
 * The terrain passes of a cell read the tile itself, the fog state of the
 * four tiles beside it (the frontier fog of an interior), the span blocks
 * and region-group images that cover it, and the distance to the party and
 * each character token (the POI outline). A change to the node replaces
 * only the changed tile objects (see `withTilesReplaced`), so an identity
 * compare finds the changed tiles. A cell whose pixels can change is then:
 *
 * - a changed tile, or a cell within marker range of an anchor that moved,
 * - grown by one cell, which covers the frontier fog of the tiles beside it
 *   and a POI glow that spills past its own cell,
 * - grown again to the whole of any span block or region group that it
 *   touches, because a block image draws across all of its cells when any
 *   one of them is revealed.
 *
 * Anything else, such as a new fog mode, a new marker range, another node,
 * or a node that changed size, returns null, and the layer then repaints
 * everything.
 */

import { isBlankMap } from './BlankMap.js';
import { parseCoords } from './MapGeometry.js';
import { getTile } from './TileGrid.js';
import { spanBlocks } from './TilePaint.js';

/** @typedef {{ minX: number, minY: number, maxX: number, maxY: number }} CellRect */
/** @typedef {import('./TerrainLayer.js').TerrainKey} TerrainKey */

/** Past this many separate rects, one rect around all of them paints faster. */
const MAX_RECTS = 24;

/**
 * Past this many changed tiles, as after a generate or a load from another
 * tab, the rects would cover most of the view, and merging them costs more
 * than a full repaint.
 */
const MAX_TILES = 128;

/**
 * @param {TerrainKey} a the key the layer pixels were painted from
 * @param {TerrainKey} b the key of the next frame
 * @returns {CellRect[] | null} the cells to repaint, or null to repaint everything
 */
export function dirtyCells(a, b) {
  if (a.revealAll !== b.revealAll || a.fogDim !== b.fogDim || a.markerRange !== b.markerRange) {
    return null;
  }
  const n0 = a.node;
  const n1 = b.node;
  if (!n0 || !n1) return null;
  if (n0 === n1 && a.regionGroups !== b.regionGroups) return null;
  if (
    n0.id !== n1.id ||
    n0.kind !== n1.kind ||
    n0.width !== n1.width ||
    n0.height !== n1.height ||
    isBlankMap(n0) !== isBlankMap(n1)
  ) {
    return null;
  }

  /** @type {CellRect[]} */
  const seeds = [];
  /** @param {string} id @param {number} reach */
  const around = (id, reach) => {
    const at = parseCoords(id);
    if (at) {
      seeds.push({
        minX: at.x - reach,
        minY: at.y - reach,
        maxX: at.x + reach,
        maxY: at.y + reach,
      });
    }
  };
  if (n0 !== n1) {
    /** @type {string[]} */
    const changed = [];
    changedTileIds(n0, n1, (id) => changed.push(id));
    if (changed.length > MAX_TILES) return null;
    for (const id of changed) around(id, 1);
  }
  const range = Math.ceil(b.markerRange) + 1;
  const before = anchorIds(a);
  const after = anchorIds(b);
  for (const id of before) if (!after.includes(id)) around(id, range);
  for (const id of after) if (!before.includes(id)) around(id, range);
  if (seeds.length === 0) return [];

  /** @type {CellRect[]} */
  const boxes = [...spanBlocks(n0), ...spanBlocks(n1), ...a.regionGroups, ...b.regionGroups];
  const grown = coverBoxes(merge(seeds), boxes);
  const clipped = grown.map((r) => ({
    minX: Math.max(0, r.minX),
    minY: Math.max(0, r.minY),
    maxX: Math.min(n1.width - 1, r.maxX),
    maxY: Math.min(n1.height - 1, r.maxY),
  }));
  return clipped.length > MAX_RECTS ? [bounds(clipped)] : clipped;
}

/**
 * Call `visit` with the id of each tile that is not the same object in both
 * nodes, from either side. Unchanged tiles share their object, so most of
 * the walk is one identity compare per position.
 * @param {import('../types/map.js').MapNode} n0
 * @param {import('../types/map.js').MapNode} n1
 * @param {(id: string) => void} visit
 */
export function changedTileIds(n0, n1, visit) {
  for (const [from, to] of [
    [n0, n1],
    [n1, n0],
  ]) {
    from.tiles.forEach((tile, i) => {
      if (to.tiles[i] !== tile && getTile(to, tile.id) !== tile) visit(tile.id);
    });
  }
}

/**
 * The tiles the POI outline measures its range from, as in `markerAnchors`.
 * @param {TerrainKey} key
 * @returns {string[]}
 */
function anchorIds(key) {
  const ids = key.tokens ? key.tokens.split(' ') : [];
  if (key.partyTileId && key.partyInNode) ids.push(key.partyTileId);
  return ids;
}

/** @param {CellRect} a @param {CellRect} b */
const overlaps = (a, b) =>
  a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY;

/** @param {CellRect} a @param {CellRect} b @returns {CellRect} */
const union = (a, b) => ({
  minX: Math.min(a.minX, b.minX),
  minY: Math.min(a.minY, b.minY),
  maxX: Math.max(a.maxX, b.maxX),
  maxY: Math.max(a.maxY, b.maxY),
});

/** @param {CellRect[]} rects @returns {CellRect} */
const bounds = (rects) => rects.reduce(union);

/**
 * Join every pair of rects that overlap, until no two overlap, so no cell
 * paints twice.
 * @param {CellRect[]} rects
 * @returns {CellRect[]}
 */
export function merge(rects) {
  const out = [...rects];
  for (let i = 0; i < out.length; i++) {
    for (let j = i + 1; j < out.length; j++) {
      if (!overlaps(out[i], out[j])) continue;
      out[i] = union(out[i], out[j]);
      out.splice(j, 1);
      j = i;
    }
  }
  return out;
}

/**
 * Grow each rect to the whole of every box it touches, and repeat until no
 * rect cuts a box in part.
 * @param {CellRect[]} rects
 * @param {CellRect[]} boxes
 * @returns {CellRect[]}
 */
function coverBoxes(rects, boxes) {
  let out = merge(rects);
  for (;;) {
    let grew = false;
    const next = out.map((rect) => {
      let r = rect;
      for (const box of boxes) {
        if (!overlaps(r, box)) continue;
        const u = union(r, box);
        if (u.minX !== r.minX || u.minY !== r.minY || u.maxX !== r.maxX || u.maxY !== r.maxY) {
          grew = true;
          r = u;
        }
      }
      return r;
    });
    if (!grew) return out;
    out = merge(next);
  }
}
