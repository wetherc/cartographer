import { parseCoords } from './MapGeometry.js';
import { findRegionGroups } from './RegionGroups.js';

/** @typedef {{ minX: number, minY: number, maxX: number, maxY: number }} Bounds */
/** @typedef {{ x: number, y: number }} Coords */

/**
 * Map a parent-map coordinate along one wall of the region block onto the child's
 * corresponding tile range, so entering straight at a wall lands beside the point
 * you entered from rather than the wall's midpoint. Clamped to the child extent.
 * @param {number} p party coordinate along the wall (parent space)
 * @param {number} min region-block extent start along that axis
 * @param {number} max region-block extent end along that axis
 * @param {number} size child node extent along that axis (tiles)
 * @returns {number} child tile index along the wall
 */
function projectAlong(p, min, max, size) {
  if (max <= min) return Math.floor((size - 1) / 2);
  const f = Math.min(1, Math.max(0, (p - min) / (max - min)));
  return Math.round(f * (size - 1));
}

/**
 * Choose the tile the party enters a child node on, based on where they stood in
 * the parent map relative to the region block they walked into. The party keeps
 * travelling continuously across the zoom instead of teleporting to the middle:
 *
 * - Approaching a wall head-on (aligned with the block's span on one axis) lands
 *   them on the inner edge tile of that wall, at the position along the wall
 *   nearest the coordinate they came from.
 * - Approaching diagonally, past a corner of the block on both axes, lands them
 *   on the matching inner corner tile of the child.
 *
 * Falls back to the grid centre when there's no approach to read (the party
 * wasn't in the parent, or stood inside the block's own footprint).
 *
 * @param {number} width child node width in tiles
 * @param {number} height child node height in tiles
 * @param {Bounds | null} block region-block bounds in the parent map
 * @param {Coords | null} party party position in the parent map
 * @returns {string} child tile id ("x,y")
 */
export function computeEntryTile(width, height, block, party) {
  const midX = Math.floor(width / 2);
  const midY = Math.floor(height / 2);
  if (!block || !party) return `${midX},${midY}`;

  const maxX = width - 1;
  const maxY = height - 1;
  // Which side of the block the party sits on, per axis: -1 before it, +1 past
  // it, 0 within its span. Two non-zero axes = a corner approach; one = a wall.
  const hx = party.x < block.minX ? -1 : party.x > block.maxX ? 1 : 0;
  const hy = party.y < block.minY ? -1 : party.y > block.maxY ? 1 : 0;

  if (hx !== 0 && hy !== 0) {
    return `${hx < 0 ? 0 : maxX},${hy < 0 ? 0 : maxY}`;
  }
  if (hx !== 0) {
    return `${hx < 0 ? 0 : maxX},${projectAlong(party.y, block.minY, block.maxY, height)}`;
  }
  if (hy !== 0) {
    return `${projectAlong(party.x, block.minX, block.maxX, width)},${hy < 0 ? 0 : maxY}`;
  }
  return `${midX},${midY}`;
}

/** @param {import('../types/map.js').Tile} tile */
function isWall(tile) {
  // Wall segments/corners are the one interior piece the party shouldn't stand
  // on; doors, stairs, and floors are all fair landing spots.
  return tile.imageRef.includes('wall-');
}

/**
 * Snap a computed entry tile to one that actually exists and can be stood on.
 * Sparse layouts (a generated dungeon's void, a castle's wall ring) can leave
 * the geometric entry pointing at nothing or at a wall; landing there would
 * strand the party outside the walkable area. Keeps the preferred tile when
 * it's real and walkable; otherwise picks the nearest walkable tile, preferring
 * a door on a tie so entering an interior reads as walking in through it.
 * Falls back to the preferred id on an empty node.
 * @param {import('../types/map.js').MapNode} node node being entered
 * @param {string} preferredId tile id ("x,y") the approach geometry chose
 * @returns {string} tile id to land the party on
 */
export function resolveEntryTile(node, preferredId) {
  const preferred = node.tiles.find((t) => t.id === preferredId);
  if (preferred && !isWall(preferred)) return preferredId;
  const candidates = node.tiles.filter((t) => !isWall(t));
  const pool = candidates.length ? candidates : node.tiles;
  if (!pool.length) return preferredId;
  const target = parseCoords(preferredId);
  if (!target) return pool[0].id;
  let best = pool[0];
  let bestScore = Infinity;
  for (const tile of pool) {
    const coords = parseCoords(tile.id);
    if (!coords) continue;
    const d = (coords.x - target.x) ** 2 + (coords.y - target.y) ** 2;
    // A door at equal distance wins: it's the authored way in.
    const score = d - (tile.imageRef.includes('door') ? 0.5 : 0);
    if (score < bestScore) {
      best = tile;
      bestScore = score;
    }
  }
  return best.id;
}

/**
 * computeEntryTile, resolved from live map state: derives the region block the
 * childNodeId occupies in the parent and the party's coordinates there, so a
 * caller can pass nodes and a PartyPosition instead of pre-computed geometry.
 * The geometric pick is then resolved against the child's actual tiles, so a
 * sparse or walled child (a generated dungeon or castle) still lands the party
 * on a real, walkable tile.
 * @param {import('../types/map.js').MapNode} parent node being viewed when zooming in
 * @param {import('../types/map.js').MapNode} child node being entered
 * @param {string} childNodeId
 * @param {import('../types/map.js').PartyPosition} party
 * @returns {string} child tile id ("x,y")
 */
export function computeRegionEntryTile(parent, child, childNodeId, party) {
  // Descending a staircase lands the party on the child level's matching
  // stairs-up, not on a border tile — the levels of a multi-level dungeon are
  // stacked, so entering "from the side" reads wrong and the stairs are the
  // one authored connection between them.
  const viaStairs = parent.tiles.some(
    (t) => t.childNodeId === childNodeId && t.imageRef.includes('stairs-down'),
  );
  const stairsUp = child.tiles.find((t) => t.imageRef.includes('stairs-up'));
  if (viaStairs && stairsUp) return stairsUp.id;

  const partyCoords = party.nodeId === parent.id ? parseCoords(party.tileId) : null;
  const group = findRegionGroups(parent).find((g) => g.childNodeId === childNodeId) ?? null;
  const block = group
    ? { minX: group.minX, minY: group.minY, maxX: group.maxX, maxY: group.maxY }
    : null;
  return resolveEntryTile(child, computeEntryTile(child.width, child.height, block, partyCoords));
}
