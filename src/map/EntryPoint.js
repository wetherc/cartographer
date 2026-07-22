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
