/**
 * The placement of region names on the map. Buildings in a town sit one or
 * two cells apart, and a name is often wider than its building, so two names
 * drawn at their default spots can overlap and hide each other. This module
 * gives each name a list of spots to try and keeps the first spot that is
 * clear of the names already placed. It is pure, so tests cover it without a
 * canvas.
 */

/**
 * A spot to try for one name, in grid units. The plate's top-left corner goes
 * on the corner of cell (x, y). With `above` set, the plate's bottom edge
 * goes on that corner instead, so the plate sits over the cell above.
 * @typedef {{ x: number, y: number, above: boolean }} LabelSpot
 */

/**
 * A label box in screen pixels.
 * @typedef {{ x: number, y: number, w: number, h: number }} LabelBox
 */

/**
 * The spots to try for a region's name, in order of preference. These are
 * the top-left corner of each cell in reading order, then the space just
 * above the region's top row, then the space just below its bottom row. The
 * first spot is the default spot, where the name sits when nothing else is
 * near. The spots outside the region are left out on the first and last rows
 * of the map, where a plate would cover the coordinate digits or hang off
 * the grid.
 * @param {{ x: number, y: number }[]} cells the region's cells, in any order
 * @param {number} height the node's height in cells
 * @returns {LabelSpot[]}
 */
export function labelSpots(cells, height) {
  if (cells.length === 0) return [];
  const sorted = [...cells].sort((a, b) => a.y - b.y || a.x - b.x);
  /** @type {LabelSpot[]} */
  const spots = sorted.map(({ x, y }) => ({ x, y, above: false }));
  const top = sorted[0];
  if (top.y > 0) spots.push({ x: top.x, y: top.y, above: true });
  // Step back from the last cell to the left end of the bottom row.
  let b = sorted.length - 1;
  while (b > 0 && sorted[b - 1].y === sorted[b].y) b--;
  const bottom = sorted[b];
  if (bottom.y + 1 < height) spots.push({ x: bottom.x, y: bottom.y + 1, above: false });
  return spots;
}

/**
 * Whether two boxes overlap, or come closer than `gap` pixels on both axes.
 * Boxes that only touch at an edge, with a gap of 0, do not overlap.
 * @param {LabelBox} a
 * @param {LabelBox} b
 * @param {number} [gap]
 * @returns {boolean}
 */
export function boxesOverlap(a, b, gap = 0) {
  return (
    a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap
  );
}

/**
 * Place labels greedily, in the order given. Each label takes the first of
 * its spots whose box overlaps no label placed before it. A label whose
 * every box overlaps is left out, and its entry is null. An earlier label
 * keeps its spot, so the order sets the priority. `boxAt` turns a spot into
 * a box only when the loop reaches it, because a large region has one spot
 * per cell and most labels fit at their first spot.
 * @param {LabelSpot[][]} spots the spots to try for each label, in order
 * @param {(index: number, spot: LabelSpot) => LabelBox} boxAt the box of label `index` at a spot
 * A label also skips a spot whose box overlaps one of the `blocked` boxes,
 * such as the tile of the party token or of a creature marker, so a name
 * plate never hides a marker.
 * @param {number} [gap] the least space, in pixels, kept between two labels
 * @param {LabelBox[]} [blocked] boxes that no label may overlap
 * @returns {(LabelBox | null)[]}
 */
export function placeLabels(spots, boxAt, gap = 0, blocked = []) {
  /** @type {LabelBox[]} */
  const placed = [];
  return spots.map((list, index) => {
    for (const spot of list) {
      const box = boxAt(index, spot);
      if (blocked.some((b) => boxesOverlap(box, b))) continue;
      if (placed.some((p) => boxesOverlap(box, p, gap))) continue;
      placed.push(box);
      return box;
    }
    return null;
  });
}

/**
 * Keep a placed name clear of the left and top edges of the map area. The
 * edges are the canvas edges, or the far side of a coordinate digit strip
 * pinned there. A name whose anchor cell lies wholly past an edge is left
 * out, and the result is null. Without this rule, a name whose region sits
 * just off the left edge draws as a fragment over the row digits. A name
 * whose anchor cell still shows past the edge slides right or down to the
 * edge, so the plate reads in full and does not cover a digit. The slide
 * comes after `placeLabels`, so the layout does not change as a pan moves
 * the edge.
 * @param {LabelBox} box the placed box of the name
 * @param {LabelBox} cell the screen box of the name's anchor cell
 * @param {{ x: number, y: number }} edge the least x and y where a plate may start
 * @returns {LabelBox | null}
 */
export function keepClearOfEdges(box, cell, edge) {
  if (cell.x + cell.w <= edge.x || cell.y + cell.h <= edge.y) return null;
  return { ...box, x: Math.max(box.x, edge.x), y: Math.max(box.y, edge.y) };
}
