import { gridCellOf, parseCoords, tileIdAt } from './MapGeometry.js';
import { tileAt } from './TileIndex.js';
import { blockFor, nearestSide, opensOutward, sideAxis, stairwayTo } from './MapExits.js';
import { isBlocked, tileKind } from './TileKinds.js';
import { clamp } from '../util/num.js';
import { projectAlong, projectBack } from './RegionCrossing.js';

/** @typedef {{ minX: number, minY: number, maxX: number, maxY: number }} Bounds */
/** @typedef {{ x: number, y: number }} Coords */

/**
 * Choose the tile where the party enters a child node. The choice depends on
 * the position of the party in the parent map relative to the region block
 * that the party entered. The party moves continuously across the zoom and
 * does not jump to the middle.
 *
 * - If the party approaches a wall directly (aligned with the block span on
 *   one axis), the party lands on the inner edge tile of that wall. The
 *   landing position is nearest to the entry coordinate along the wall.
 * - If the party approaches diagonally past a corner of the block on both
 *   axes, the party lands on the matching inner corner tile of the child.
 *
 * The function returns the center tile of the grid if there is no approach to
 * read. This can happen if the party was not in the parent map or stood
 * inside the block footprint.
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
  // This axis value shows the side of the block where the party sits: -1
  // before it, +1 past it, 0 within its span. Two nonzero axes mean a corner
  // approach. One nonzero axis means a wall approach.
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
 * Snap a computed entry tile to a tile that exists and can hold the party.
 * A sparse layout, for example a generated dungeon void or a castle wall
 * ring, can leave the geometric entry pointing at nothing, at a wall, or at
 * an obstacle such as a pillar. Landing there strands the party outside the
 * walkable area. The function keeps the preferred tile when the tile is real
 * and walkable. Otherwise the function picks the nearest walkable tile and
 * prefers a door on a tie. This makes entering an interior read as walking
 * through it. The function returns the preferred id when the node is empty.
 * @param {import('../types/map.js').MapNode} node node being entered
 * @param {string} preferredId tile id ("x,y") the approach geometry chose
 * @returns {string} tile id to land the party on
 */
export function resolveEntryTile(node, preferredId) {
  const preferred = tileAt(node, preferredId);
  if (preferred && !isBlocked(preferred)) return preferredId;
  const candidates = node.tiles.filter((t) => !isBlocked(t));
  const pool = candidates.length ? candidates : node.tiles;
  if (!pool.length) return preferredId;
  const target = parseCoords(preferredId);
  if (!target) return pool[0].id;
  let best = pool[0];
  let bestScore = Infinity;
  for (const tile of pool) {
    const d = distanceSq(node, tile.id, target);
    if (d < 0) continue;
    // A door wins at equal distance because it is the intended way in.
    const score = d - (tileKind(tile) === 'door' ? 0.5 : 0);
    if (score < bestScore) {
      best = tile;
      bestScore = score;
    }
  }
  return best.id;
}

/**
 * This function runs computeEntryTile from live map state. The function
 * finds the region block that childNodeId occupies in the parent and finds
 * the party coordinates there. A caller can pass nodes and a PartyPosition
 * instead of precomputed geometry. The function resolves the geometric pick
 * against the actual tiles of the child. This step makes sure that a sparse
 * or walled child, for example a generated dungeon or castle, lands the
 * party on a real, walkable tile.
 * @param {import('../types/map.js').MapNode} parent node being viewed when zooming in
 * @param {import('../types/map.js').MapNode} child node being entered
 * @param {string} childNodeId
 * @param {import('../types/map.js').PartyPosition} party
 * @param {string | null} [throughTileId] parent tile the party zooms through,
 *   which picks the block when two blocks link the same child
 * @returns {string} child tile id ("x,y")
 */
export function computeRegionEntryTile(parent, child, childNodeId, party, throughTileId = null) {
  // Taking a staircase lands the party on the matching staircase of the child
  // level, not on a border tile. Stacked levels sit above and below each
  // other, so an entry from the side is incorrect. The stairs are the only
  // intended connection between stacked levels. The staircase used depends
  // on the direction of travel. Descend into a crypt level and arrive at its
  // stairs up. Climb to an upper level and arrive at its stairs down. If a
  // level has no matching staircase, the function uses the geometric entry
  // below instead.
  const stairway = stairwayTo(parent, childNodeId);
  const landing = stairway ? child.tiles.find((t) => tileKind(t) === stairway.back) : undefined;
  if (landing) return landing.id;

  const partyCoords = party.nodeId === parent.id ? parseCoords(party.tileId) : null;
  const group = blockFor(parent, childNodeId, throughTileId);
  const block = group
    ? { minX: group.minX, minY: group.minY, maxX: group.maxX, maxY: group.maxY }
    : null;
  const preferred = computeEntryTile(child.width, child.height, block, partyCoords);
  // An interior is entered through its door. The floor tile nearest the
  // approach side can be far from the door, or near the stairs down of a
  // generated dungeon, so the party lands on the outward door nearest the
  // geometric pick. An interior with no outward door falls back to the
  // nearest walkable tile.
  const door = child.kind === 'interior' ? nearestOutwardDoor(child, preferred) : null;
  return door ?? resolveEntryTile(child, preferred);
}

/**
 * Choose the tile where the party lands after it walks across a border from
 * one region into the next (`RegionCrossing.crossingFor`). The parent cell
 * the party crosses into sits somewhere in the block of the new region. The
 * function projects that cell on both axes onto the grid of the new region,
 * so a party that crosses near a corner of the block lands near the matching
 * corner of the map. The result snaps to a walkable tile.
 * @param {import('../types/map.js').MapNode} parent the node both regions belong to
 * @param {import('../types/map.js').MapNode} target the region being entered
 * @param {string} crossTileId the parent cell the party crosses into
 * @returns {string} target tile id ("x,y")
 */
export function computeCrossingEntryTile(parent, target, crossTileId) {
  const group = blockFor(parent, target.id, crossTileId);
  const cell = parseCoords(crossTileId);
  if (!group || !cell) {
    return resolveEntryTile(
      target,
      tileIdAt(Math.floor(target.width / 2), Math.floor(target.height / 2)),
    );
  }
  const x = projectAlong(cell.x, group.minX, group.maxX, target.width);
  const y = projectAlong(cell.y, group.minY, group.maxY, target.height);
  return resolveEntryTile(target, tileIdAt(x, y));
}

/**
 * The outward door of an interior nearest a tile, or null when the interior
 * has none. An outward door is a door or a cave mouth with the outside of
 * the structure on one side (`MapExits.opensOutward`). A door that links to
 * a child node leads further in, so it does not count.
 * @param {import('../types/map.js').MapNode} node
 * @param {string} nearId tile id ("x,y") to measure from
 * @returns {string | null}
 */
export function nearestOutwardDoor(node, nearId) {
  const target = parseCoords(nearId) ?? { x: 0, y: 0 };
  let best = null;
  let bestScore = Infinity;
  for (const tile of node.tiles) {
    if (tile.childNodeId || tileKind(tile) !== 'door' || !opensOutward(node, tile)) continue;
    const d = distanceSq(node, tile.id, target);
    if (d < bestScore) {
      best = tile.id;
      bestScore = d;
    }
  }
  return best;
}

/**
 * This function finds where the party lands in the parent map when the
 * party leaves a child node. It is the mirror of computeRegionEntryTile:
 * entering a sub-region and walking back out puts the party next to the
 * tile that the party came from, not at the block midpoint.
 *
 * - Off an edge: the function maps the coordinate along that side of the
 *   child back onto the block extent, then one cell further out, onto the
 *   parent terrain that the side touches.
 * - Through a door: the function uses the same projection, from the
 *   coordinate of the door, using the nearest side of the interior to the
 *   door.
 * - Along a stairway: the function returns the parent tile at the other end
 *   of the stairway, in either direction. This tile belongs to the block
 *   being left. The function returns the tile as it stands instead of
 *   snapping it, because snapping rejects the tile for that reason.
 * - Fallback: the function returns the block itself, where the entrance art
 *   sits.
 *
 * @param {import('../types/map.js').MapNode} parent node being returned to
 * @param {import('../types/map.js').MapNode} child node being left
 * @param {import('../types/map.js').MapExit} exit the way out being used
 * @param {import('../types/map.js').PartyPosition} position who is leaving, and from where
 * @param {string | null} [throughTileId] parent tile the party entered
 *   through, if known. When two blocks link the same child, the party
 *   returns beside the block it came in by.
 * @returns {string} parent tile id ("x,y")
 */
export function computeParentReturnTile(parent, child, exit, position, throughTileId = null) {
  const centre = tileIdAt(Math.floor(parent.width / 2), Math.floor(parent.height / 2));
  if (exit.kind === 'tile' && (exit.via === 'stairs-up' || exit.via === 'stairs-down')) {
    const stairway = stairwayTo(parent, child.id);
    if (stairway) return stairway.tile.id;
  }
  const group = blockFor(parent, child.id, throughTileId);
  if (!group) return resolveReturnTile(parent, centre, child.id);
  const anchor = blockAnchor(parent, group);
  if (exit.kind === 'fallback') return anchor;

  const from = position.nodeId === child.id ? parseCoords(position.tileId) : null;
  const at = exit.kind === 'tile' ? (parseCoords(exit.tileId) ?? from) : from;
  const side = exit.kind === 'edge' ? exit.side : at ? nearestSide(child, at) : 'north';
  const along = at ?? { x: Math.floor(child.width / 2), y: Math.floor(child.height / 2) };
  // A door leads back out beside the block tile the party came in through,
  // on the side the door faces. A projection of a door in the middle of a
  // wall falls between the two middle tiles of an even block, and rounds
  // to the tile that the party did not use.
  const via =
    exit.kind === 'tile' && throughTileId && group.tileIds.includes(throughTileId)
      ? parseCoords(throughTileId)
      : null;
  let x;
  let y;
  if (sideAxis(side) === 'x') {
    x = via ? via.x : projectBack(along.x, child.width, group.minX, group.maxX);
    y = side === 'north' ? group.minY - 1 : group.maxY + 1;
  } else {
    y = via ? via.y : projectBack(along.y, child.height, group.minY, group.maxY);
    x = side === 'west' ? group.minX - 1 : group.maxX + 1;
  }
  // A block flush against the parent's north or west edge projects to a
  // coordinate of -1. That id parses as nothing, and the snap below would
  // then fall back to the first painted tile, at the origin. Clamping into
  // the grid keeps the landing beside the block. The snap still moves it off
  // the block onto the nearest painted cell.
  const inside = tileIdAt(clamp(x, 0, parent.width - 1), clamp(y, 0, parent.height - 1));
  return resolveReturnTile(parent, inside, child.id);
}

/**
 * This function finds the tile that stands for a region block. The function
 * returns the tile that carries the entrance art, or the first member tile
 * if no tile carries the art. The party lands here when a node has no
 * intended way out and no terrain beside its block to step onto.
 * @param {import('../types/map.js').MapNode} parent
 * @param {import('./RegionGroups.js').RegionGroup} group
 * @returns {string}
 */
function blockAnchor(parent, group) {
  const marked = group.tileIds.find((id) => tileAt(parent, id)?.metadata.poiType);
  return marked ?? group.tileIds[0];
}

/**
 * The squared grid distance from a tile id to a cell, or -1 when the id is
 * not a grid coordinate. A canonical id inside the node reads through
 * gridCellOf, which allocates nothing. Only an odd id pays for parseCoords.
 * The nearest-tile searches below call this once for each tile of a node.
 * @param {import('../types/map.js').MapNode} node
 * @param {string} id
 * @param {Coords} target
 * @returns {number}
 */
function distanceSq(node, id, target) {
  const cell = gridCellOf(id, node.width, node.height);
  if (cell >= 0) {
    const x = cell % node.width;
    return (x - target.x) ** 2 + ((cell - x) / node.width - target.y) ** 2;
  }
  const coords = parseCoords(id);
  return coords ? (coords.x - target.x) ** 2 + (coords.y - target.y) ** 2 : -1;
}

/**
 * A returning party steps onto a plain tile rather than the link tile of a
 * neighbour block when a plain tile lies this close to the computed spot.
 * The value is a squared distance, so it covers the eight cells around the
 * spot and the cells two steps away in a straight line. A town packs its
 * buildings close together. Without this rule, a party that leaves one
 * building by its door can land on the block of the building next door.
 */
const PLAIN_TILE_RANGE_SQ = 4;

/**
 * This function is the parent-side counterpart of resolveEntryTile. The
 * function snaps a computed landing spot to a tile that exists, is painted,
 * and can hold the party. A returning party must land on a cell outside the
 * region block, so the function excludes the block that the party just
 * left. Landing back on that block reads as if the party never left.
 * The function also prefers a plain tile near the spot over the link tile of
 * another block. It uses a link tile only when no plain tile lies within
 * PLAIN_TILE_RANGE_SQ, as on a world map that regions cover edge to edge.
 * The function falls back to any painted tile, then to the preferred id
 * when the parent has no painted tiles.
 * @param {import('../types/map.js').MapNode} parent
 * @param {string} preferredId tile id the return geometry chose
 * @param {string} excludeChildNodeId child node whose block to stay off
 * @returns {string}
 */
export function resolveReturnTile(parent, preferredId, excludeChildNodeId) {
  /** @param {import('../types/map.js').Tile} t */
  const isUsable = (t) => !!t.imageRef && !isBlocked(t) && t.childNodeId !== excludeChildNodeId;
  const usable = parent.tiles.filter(isUsable);
  const pool = usable.length ? usable : parent.tiles.filter((t) => t.imageRef);
  if (!pool.length) return preferredId;
  const preferred = tileAt(parent, preferredId);
  const target = parseCoords(preferredId);
  if (preferred && isUsable(preferred) && !preferred.childNodeId) return preferredId;
  if (target) {
    const plain = nearestTile(
      parent,
      usable.filter((t) => !t.childNodeId),
      target,
    );
    if (plain && plain.d <= PLAIN_TILE_RANGE_SQ) return plain.tile.id;
  }
  if (preferred && (usable.length ? isUsable(preferred) : preferred.imageRef)) return preferredId;
  if (!target) return pool[0].id;
  return (nearestTile(parent, pool, target)?.tile ?? pool[0]).id;
}

/**
 * The tile of a list nearest to a cell, with its squared distance. Tiles
 * whose ids do not parse are skipped. The function returns null when no
 * tile scores.
 * @param {import('../types/map.js').MapNode} node
 * @param {import('../types/map.js').Tile[]} tiles
 * @param {Coords} target
 * @returns {{ tile: import('../types/map.js').Tile, d: number } | null}
 */
function nearestTile(node, tiles, target) {
  /** @type {{ tile: import('../types/map.js').Tile, d: number } | null} */
  let best = null;
  for (const tile of tiles) {
    const d = distanceSq(node, tile.id, target);
    if (d >= 0 && (!best || d < best.d)) best = { tile, d };
  }
  return best;
}
