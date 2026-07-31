import { parseCoords, tileIdAt } from './MapGeometry.js';
import { blockFor, nearestSide, sideAxis, stairwayTo } from './MapExits.js';
import { kindOf } from './TilePalette.js';

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

/**
 * The inverse of projectAlong: a coordinate along one side of a child map,
 * mapped back onto the parent block's extent on that axis, so leaving by an edge
 * puts the party beside the point of the block they walked out of.
 * @param {number} p coordinate along the side (child space)
 * @param {number} size child node extent along that axis (tiles)
 * @param {number} min region-block extent start along that axis
 * @param {number} max region-block extent end along that axis
 * @returns {number} parent coordinate along the block
 */
function projectBack(p, size, min, max) {
  if (size <= 1) return Math.round((min + max) / 2);
  const f = Math.min(1, Math.max(0, p / (size - 1)));
  return Math.round(min + f * (max - min));
}

/** @param {import('../types/map.js').Tile} tile */
function isWall(tile) {
  // Wall segments/corners are the one interior piece the party shouldn't stand
  // on; doors, stairs, and floors are all fair landing spots.
  return kindOf(tile.imageRef) === 'wall';
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
    const score = d - (kindOf(tile.imageRef) === 'door' ? 0.5 : 0);
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
  // Taking a staircase lands the party on the child level's matching staircase,
  // not on a border tile — stacked levels sit above and below each other, so
  // entering "from the side" reads wrong and the stairs are the one authored
  // connection between them. Which staircase depends on the direction of travel:
  // descend into a crypt level and arrive at its stairs up, climb to an upper
  // storey and arrive at its stairs down. A level missing that staircase falls
  // through to the geometric entry below.
  const stairway = stairwayTo(parent, childNodeId);
  const landing = stairway
    ? child.tiles.find((t) => kindOf(t.imageRef) === stairway.back)
    : undefined;
  if (landing) return landing.id;

  const partyCoords = party.nodeId === parent.id ? parseCoords(party.tileId) : null;
  const group = blockFor(parent, childNodeId);
  const block = group
    ? { minX: group.minX, minY: group.minY, maxX: group.maxX, maxY: group.maxY }
    : null;
  return resolveEntryTile(child, computeEntryTile(child.width, child.height, block, partyCoords));
}

/**
 * Where the party lands in the parent when they leave a child node — the mirror
 * of computeRegionEntryTile, so entering a sub-region and walking back out puts
 * them next to the tile they came from rather than at the block's midpoint.
 *
 * - Off an edge: their coordinate along that side of the child maps back onto the
 *   block's extent, then one cell further out, onto the parent terrain the side
 *   abuts.
 * - Through a door: the same projection, from the door's own coordinate, using
 *   the side of the interior the door sits nearest.
 * - Along a stairway: the parent's own tile at the other end of it, whichever
 *   direction it runs. It is a tile of the block being left, so it is returned as
 *   it stands rather than snapped, which would reject it for that reason.
 * - Fallback: the block itself, which is where the entrance art sits.
 *
 * @param {import('../types/map.js').MapNode} parent node being returned to
 * @param {import('../types/map.js').MapNode} child node being left
 * @param {import('../types/map.js').MapExit} exit the way out being used
 * @param {import('../types/map.js').PartyPosition} position who is leaving, and from where
 * @returns {string} parent tile id ("x,y")
 */
export function computeParentReturnTile(parent, child, exit, position) {
  const centre = tileIdAt(Math.floor(parent.width / 2), Math.floor(parent.height / 2));
  if (exit.kind === 'tile' && (exit.via === 'stairs-up' || exit.via === 'stairs-down')) {
    const stairway = stairwayTo(parent, child.id);
    if (stairway) return stairway.tile.id;
  }
  const group = blockFor(parent, child.id);
  if (!group) return resolveReturnTile(parent, centre, child.id);
  const anchor = blockAnchor(parent, group);
  if (exit.kind === 'fallback') return anchor;

  const from = position.nodeId === child.id ? parseCoords(position.tileId) : null;
  const at = exit.kind === 'tile' ? (parseCoords(exit.tileId) ?? from) : from;
  const side = exit.kind === 'edge' ? exit.side : at ? nearestSide(child, at) : 'north';
  const along = at ?? { x: Math.floor(child.width / 2), y: Math.floor(child.height / 2) };
  let x;
  let y;
  if (sideAxis(side) === 'x') {
    x = projectBack(along.x, child.width, group.minX, group.maxX);
    y = side === 'north' ? group.minY - 1 : group.maxY + 1;
  } else {
    y = projectBack(along.y, child.height, group.minY, group.maxY);
    x = side === 'west' ? group.minX - 1 : group.maxX + 1;
  }
  return resolveReturnTile(parent, tileIdAt(x, y), child.id);
}

/**
 * The tile of a region block that stands for it — the one carrying the entrance
 * art, else the first member. Where a party lands when a node has no authored
 * way out and no terrain beside its block to step onto.
 * @param {import('../types/map.js').MapNode} parent
 * @param {import('./RegionGroups.js').RegionGroup} group
 * @returns {string}
 */
function blockAnchor(parent, group) {
  const marked = group.tileIds.find(
    (id) => parent.tiles.find((t) => t.id === id)?.metadata.poiType,
  );
  return marked ?? group.tileIds[0];
}

/**
 * The parent-side counterpart of resolveEntryTile: snap a computed landing spot
 * to a tile that exists, is painted, and can be stood on. Cells outside the
 * region block are what a returning party should land on, so the block they just
 * came out of is excluded — landing back on it reads as never having left. Falls
 * back to any painted tile, then to the preferred id on an unpainted parent.
 * @param {import('../types/map.js').MapNode} parent
 * @param {string} preferredId tile id the return geometry chose
 * @param {string} excludeChildNodeId child node whose block to stay off
 * @returns {string}
 */
export function resolveReturnTile(parent, preferredId, excludeChildNodeId) {
  const usable = parent.tiles.filter(
    (t) => t.imageRef && !isWall(t) && t.childNodeId !== excludeChildNodeId,
  );
  const pool = usable.length ? usable : parent.tiles.filter((t) => t.imageRef);
  if (!pool.length) return preferredId;
  if (pool.some((t) => t.id === preferredId)) return preferredId;
  const target = parseCoords(preferredId);
  if (!target) return pool[0].id;
  let best = pool[0];
  let bestScore = Infinity;
  for (const tile of pool) {
    const coords = parseCoords(tile.id);
    if (!coords) continue;
    const d = (coords.x - target.x) ** 2 + (coords.y - target.y) ** 2;
    if (d < bestScore) {
      best = tile;
      bestScore = d;
    }
  }
  return best.id;
}
