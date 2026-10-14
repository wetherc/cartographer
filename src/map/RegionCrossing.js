import { tileIdAt } from './MapGeometry.js';
import { getTile } from './TileGrid.js';
import { clamp } from '../util/num.js';

/** @typedef {import('../types/map.js').MapNode} MapNode */
/** @typedef {import('../types/map.js').ExitSide} ExitSide */
/** @typedef {import('./RegionGroups.js').RegionGroup} RegionGroup */

/**
 * Map a coordinate along one wall of the region block onto the matching tile
 * range of the child. This action puts the party beside the entry point when
 * the party enters directly at a wall, not at the wall midpoint. The result
 * stays within the child extent.
 * @param {number} p party coordinate along the wall (parent space)
 * @param {number} min region-block extent start along that axis
 * @param {number} max region-block extent end along that axis
 * @param {number} size child node extent along that axis (tiles)
 * @returns {number} child tile index along the wall
 */
export function projectAlong(p, min, max, size) {
  if (max <= min) return Math.floor((size - 1) / 2);
  const f = clamp((p - min) / (max - min), 0, 1);
  return Math.round(f * (size - 1));
}

/**
 * This function is the inverse of projectAlong. The function maps a
 * coordinate along one side of a child map back onto the parent block extent
 * on that axis. This action puts the party beside the point of the block
 * that the party left when the party exits by an edge.
 * @param {number} p coordinate along the side (child space)
 * @param {number} size child node extent along that axis (tiles)
 * @param {number} min region-block extent start along that axis
 * @param {number} max region-block extent end along that axis
 * @returns {number} parent coordinate along the block
 */
export function projectBack(p, size, min, max) {
  if (size <= 1) return Math.round((min + max) / 2);
  const f = clamp(p / (size - 1), 0, 1);
  return Math.round(min + f * (max - min));
}

/**
 * The parent cell just past a region block on one side, in the row or column
 * `along`. A painted block has an uneven outline, so the function finds the
 * block's outermost cell in that row or column and steps one cell further
 * out. A 4-connected block has at least one cell in each row and column of
 * its bounding box, so the result is null only when `along` is outside the
 * box.
 * @param {RegionGroup} group
 * @param {ExitSide} side
 * @param {number} along parent column (north, south) or row (east, west)
 * @returns {{ x: number, y: number } | null}
 */
export function sideCell(group, side, along) {
  const vertical = side === 'north' || side === 'south';
  const outward = side === 'north' || side === 'west' ? -1 : 1;
  let best = null;
  for (const cell of group.cells) {
    if ((vertical ? cell.x : cell.y) !== along) continue;
    const depth = vertical ? cell.y : cell.x;
    if (best === null || depth * outward > best * outward) best = depth;
  }
  if (best === null) return null;
  return vertical ? { x: along, y: best + outward } : { x: best + outward, y: along };
}

/**
 * The region across the border from a child, where a traveler walks off one
 * side of it. The traveler's coordinate along that side projects back onto
 * the child's block in the parent (`projectBack`), and the cell past the
 * block there (`sideCell`) decides. When that cell links to another outdoor
 * child of the same parent, the walk crosses into that child. Otherwise the
 * function returns null, and the side leads back to the parent. An interior
 * is never a crossing target, because the party enters a structure through
 * its door.
 * @param {MapNode} parent
 * @param {MapNode} child the node the traveler walks off
 * @param {RegionGroup} group the child's block the traveler is in
 * @param {ExitSide} side
 * @param {{ x: number, y: number }} at the traveler's cell in the child
 * @param {(id: string) => MapNode | null | undefined} nodeById
 * @returns {{ target: MapNode, tileId: string } | null}
 */
export function crossingFor(parent, child, group, side, at, nodeById) {
  const vertical = side === 'north' || side === 'south';
  const along = vertical
    ? projectBack(at.x, child.width, group.minX, group.maxX)
    : projectBack(at.y, child.height, group.minY, group.maxY);
  // projectBack keeps `along` inside the block's bounding box, so the block
  // has a cell in that row or column.
  const cell = /** @type {{ x: number, y: number }} */ (sideCell(group, side, along));
  const tile = getTile(parent, tileIdAt(cell.x, cell.y));
  if (!tile?.childNodeId || tile.childNodeId === child.id) return null;
  const target = nodeById(tile.childNodeId);
  if (!target || target.kind === 'interior' || target.parentId !== parent.id) return null;
  return { target, tileId: tile.id };
}
