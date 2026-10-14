/**
 * The placement of region names on the map. In a town each building is a
 * region, buildings sit one or two cells apart, and a name is often wider
 * than its building. A name centers over its own region, and it tries the
 * space just above and just below the region when the center is taken. A
 * name that would cover much of another region, another name, or a marker
 * at every one of those spots is left out at this zoom, and the map hover
 * names the place instead. It is pure, so tests cover it without a canvas.
 */

/**
 * A box in screen pixels.
 * @typedef {{ x: number, y: number, w: number, h: number }} LabelBox
 */

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
 * The share of a region's area that another name may cover. A town building
 * is one to four cells, so a name that runs over a neighbor covers well past
 * this share and hides the art of that building. A large region, such as a
 * province on the world map, has hundreds of cells, so the name of a small
 * region inside it covers far less and still draws.
 */
const COVER_SHARE = 0.05;

/**
 * The area where two boxes overlap, or 0.
 * @param {LabelBox} a
 * @param {LabelBox} b
 * @returns {number}
 */
export function overlapArea(a, b) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/**
 * The smallest box around every listed box.
 * @param {LabelBox[]} boxes at least one box
 * @returns {LabelBox}
 */
export function boundsOf(boxes) {
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const b of boxes) {
    x1 = Math.min(x1, b.x);
    y1 = Math.min(y1, b.y);
    x2 = Math.max(x2, b.x + b.w);
    y2 = Math.max(y2, b.y + b.h);
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/**
 * The point that a name centers on: the mean of the cell centers. For an
 * L-shaped or ring-shaped region that point can fall outside the region, so
 * then the center of the cell nearest to it is used instead.
 * @param {LabelBox[]} cells the screen boxes of the region's cells, at least one
 * @returns {{ x: number, y: number }}
 */
export function footprintCenter(cells) {
  let sx = 0;
  let sy = 0;
  for (const c of cells) {
    sx += c.x + c.w / 2;
    sy += c.y + c.h / 2;
  }
  const mean = { x: sx / cells.length, y: sy / cells.length };
  const inside = (/** @type {LabelBox} */ c) =>
    mean.x >= c.x && mean.x <= c.x + c.w && mean.y >= c.y && mean.y <= c.y + c.h;
  if (cells.some(inside)) return mean;
  let best = cells[0];
  let bestD = Infinity;
  for (const c of cells) {
    const d = (c.x + c.w / 2 - mean.x) ** 2 + (c.y + c.h / 2 - mean.y) ** 2;
    if (d < bestD) [best, bestD] = [c, d];
  }
  return { x: best.x + best.w / 2, y: best.y + best.h / 2 };
}

/**
 * The boxes to try for one name, in order of preference: centered on the
 * region, then centered just above it, then centered just below it. The
 * spots outside the region are left out on the first and last rows of the
 * map, where a plate would cover the coordinate digits or hang off the grid.
 * @param {LabelBox[]} cells the screen boxes of the region's cells, at least one
 * @param {number} w the plate width
 * @param {number} h the plate height
 * @param {{ above: boolean, below: boolean }} room whether the map has a row above and below the region
 * @returns {LabelBox[]}
 */
export function labelCandidates(cells, w, h, room) {
  const c = footprintCenter(cells);
  const bounds = boundsOf(cells);
  const x = c.x - w / 2;
  const boxes = [{ x, y: c.y - h / 2, w, h }];
  if (room.above) boxes.push({ x, y: bounds.y - h, w, h });
  if (room.below) boxes.push({ x, y: bounds.y + bounds.h, w, h });
  return boxes;
}

/**
 * Place names greedily, in the order given, so the order sets the priority.
 * Each name takes the first of its candidate boxes that overlaps no name
 * placed before it, no `blocked` box, and no more than `COVER_SHARE` of the
 * area of another region. A name with no such box is left out, and its entry
 * is null.
 * @param {{ candidates: LabelBox[], cells: LabelBox[] }[]} labels the boxes to try and the region cells of each name
 * @param {number} [gap] the least space, in pixels, kept between two names
 * @param {LabelBox[]} [blocked] boxes that no name may overlap, such as a marker's tile
 * @returns {(LabelBox | null)[]}
 */
export function placeLabels(labels, gap = 0, blocked = []) {
  // A bounds check per region skips the cell loop of every far region.
  const bounds = labels.map((l) => (l.cells.length ? boundsOf(l.cells) : null));
  const areas = labels.map((l) => l.cells.reduce((sum, c) => sum + c.w * c.h, 0));
  /** @param {LabelBox} box @param {number} own */
  const coversOther = (box, own) =>
    labels.some((l, j) => {
      const b = bounds[j];
      if (j === own || b === null || !boxesOverlap(box, b)) return false;
      let covered = 0;
      for (const c of l.cells) covered += overlapArea(box, c);
      return covered > areas[j] * COVER_SHARE;
    });
  /** @type {LabelBox[]} */
  const placed = [];
  return labels.map((label, i) => {
    for (const box of label.candidates) {
      if (blocked.some((b) => boxesOverlap(box, b))) continue;
      if (placed.some((p) => boxesOverlap(box, p, gap))) continue;
      if (coversOther(box, i)) continue;
      placed.push(box);
      return box;
    }
    return null;
  });
}

/**
 * Keep a placed name clear of the left and top edges of the map area. The
 * edges are the canvas edges, or the far side of a coordinate digit strip
 * pinned there. A name whose region lies wholly past an edge is left out,
 * and the result is null. Without this rule, a name whose region sits just
 * off the left edge draws as a fragment over the row digits. A name whose
 * region still shows past the edge slides right or down to the edge, so the
 * plate reads in full and does not cover a digit. The slide comes after
 * `placeLabels`, so the layout does not change as a pan moves the edge.
 * @param {LabelBox} box the placed box of the name
 * @param {LabelBox} region the screen bounds of the name's region
 * @param {{ x: number, y: number }} edge the least x and y where a plate may start
 * @returns {LabelBox | null}
 */
export function keepClearOfEdges(box, region, edge) {
  if (region.x + region.w <= edge.x || region.y + region.h <= edge.y) return null;
  return { ...box, x: Math.max(box.x, edge.x), y: Math.max(box.y, edge.y) };
}
