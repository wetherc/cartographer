import { cellEdge, parseCoords } from './MapGeometry.js';
import { boundsOf, keepClearOfEdges, labelCandidates, placeLabels } from './RegionLabels.js';
import { coordLabelLayout } from './CoordLabels.js';

/**
 * The layout math of the region overlay: the cells each tint covers, the
 * width of its border, and where each region name goes. `RegionOverlay.js`
 * draws what these functions return, and a test can check the layout with no
 * canvas.
 */

/** @typedef {import('./RegionGroups.js').RegionGroup} RegionGroup */
/** @typedef {import('./MapRenderer.js').MapView} MapView */
/** @typedef {import('./RegionLabels.js').LabelBox} LabelBox */
/** @typedef {import('./TileIndex.js').RevealedIds} RevealedIds */

/** The font size of a region name, in CSS pixels. */
const REGION_LABEL_PX = 12;

/**
 * The screen boxes of the cells of one region that its tint covers. Under
 * solid fog only the revealed cells count, so the list is empty for a region
 * the party has not seen.
 * @param {RegionGroup} group
 * @param {Pick<MapView, 'offsetX' | 'offsetY'>} view
 * @param {number} size the on-screen tile size in buffer px
 * @param {RevealedIds | null} revealedIds null in Build mode and under see-through fog
 * @returns {LabelBox[]}
 */
export function regionCellBoxes(group, view, size, revealedIds) {
  /** @type {LabelBox[]} */
  const boxes = [];
  for (let i = 0; i < group.tileIds.length; i++) {
    if (revealedIds && !revealedIds.has(group.tileIds[i])) continue;
    const cell = group.cells[i];
    const x = cellEdge(cell.x, size, view.offsetX);
    const y = cellEdge(cell.y, size, view.offsetY);
    boxes.push({
      x,
      y,
      w: cellEdge(cell.x + 1, size, view.offsetX) - x,
      h: cellEdge(cell.y + 1, size, view.offsetY) - y,
    });
  }
  return boxes;
}

/**
 * The drawn width of a region border in buffer px: 2 to 4 CSS px by tile
 * size, and twice that for the target of the Region brush. The canvas
 * strokes twice this width, because the clip cuts away the outer half.
 * @param {number} size the on-screen tile size in buffer px
 * @param {number} px the device pixel ratio
 * @param {boolean} emphasized whether the region is the brush target
 * @returns {number}
 */
export function regionBorderWidth(size, px, emphasized) {
  return Math.max(2, Math.min(4, size / 12)) * px * (emphasized ? 2 : 1);
}

/**
 * The font size and plate padding of a region name, in buffer px.
 * @param {number} px the device pixel ratio
 * @returns {{ fontSize: number, padX: number, padY: number, h: number }}
 */
export function regionLabelMetrics(px) {
  const fontSize = Math.round(REGION_LABEL_PX * px);
  const padX = 4 * px;
  const padY = 2 * px;
  return { fontSize, padX, padY, h: fontSize + padY * 2 };
}

/**
 * Where each region name goes, as the plate box of each name that draws,
 * and the child node ids of the names that do not fit at this zoom. A name
 * with no revealed cell, and a name whose box `keepClearOfEdges` drops or
 * that lies off the canvas, is in neither list. `measure` gives the text
 * width of a name in the label font.
 * @param {MapView} view
 * @param {RevealedIds | null} revealedIds
 * @param {number} tileSize base tile size in buffer px at scale 1
 * @param {(nodeId: string) => string | undefined} getNodeName
 * @param {string[]} blockedIds tiles with a token or marker, which no name plate covers
 * @param {(name: string) => number} measure
 * @returns {{ placed: { name: string, box: LabelBox }[], hidden: string[] }}
 */
export function regionNameLayout(view, revealedIds, tileSize, getNodeName, blockedIds, measure) {
  /** @type {{ placed: { name: string, box: LabelBox }[], hidden: string[] }} */
  const out = { placed: [], hidden: [] };
  const node = view.node;
  if (!node) return out;
  const size = tileSize * view.scale;
  const px = view.pixelRatio ?? 1;
  const { padX, h } = regionLabelMetrics(px);
  /** @type {{ name: string, nodeId: string, candidates: LabelBox[], cells: LabelBox[] }[]} */
  const labels = [];
  for (const group of view.regionGroups) {
    const cells = regionCellBoxes(group, view, size, revealedIds);
    if (cells.length === 0) continue;
    const name = getNodeName(group.childNodeId);
    if (!name) {
      // Other names still stay off the cells of a nameless region.
      labels.push({ name: '', nodeId: group.childNodeId, candidates: [], cells });
      continue;
    }
    const room = { above: group.minY > 0, below: group.maxY + 1 < node.height };
    const candidates = labelCandidates(cells, measure(name) + padX * 2, h, room);
    labels.push({ name, nodeId: group.childNodeId, candidates, cells });
  }
  const boxes = placeLabels(
    labels,
    px,
    // A name also keeps out from under the floating mini-map.
    [...cellBoxes(blockedIds, view, size), ...(view.occluders ?? []).filter((o) => o.float)],
  );
  const edge = mapAreaEdge(view, tileSize);
  boxes.forEach((kept, i) => {
    const { name, nodeId, cells } = labels[i];
    if (!name) return;
    if (!kept) {
      out.hidden.push(nodeId);
      return;
    }
    const box = keepClearOfEdges(kept, boundsOf(cells), edge);
    if (!box || box.x > view.canvasWidth || box.y > view.canvasHeight) return;
    out.placed.push({ name, box });
  });
  return out;
}

/**
 * The least x and y where a region name may start: the canvas edge, or the
 * far side of a row or column digit strip pinned to that edge. A strip that
 * sits off the map, beside its edge, lies left of or above every cell, so it
 * moves no name.
 * @param {import('./CoordLabels.js').CoordView} view
 * @param {number} tileSize base tile size in buffer px at scale 1
 * @returns {{ x: number, y: number }}
 */
export function mapAreaEdge(view, tileSize) {
  const layout = coordLabelLayout(view, tileSize);
  const rows = layout?.rows;
  const columns = layout?.columns;
  return {
    x: Math.max(0, rows ? rows.x + rows.w : 0),
    y: Math.max(0, columns ? columns.y + columns.h : 0),
  };
}

/**
 * The screen boxes of the listed tiles, for the label layout to keep clear.
 * @param {string[]} ids tile ids in "x,y" form
 * @param {Pick<MapView, 'offsetX' | 'offsetY'>} view
 * @param {number} size the on-screen tile size in buffer px
 * @returns {LabelBox[]}
 */
export function cellBoxes(ids, view, size) {
  /** @type {LabelBox[]} */
  const boxes = [];
  for (const id of ids) {
    const c = parseCoords(id);
    if (!c) continue;
    const x = cellEdge(c.x, size, view.offsetX);
    const y = cellEdge(c.y, size, view.offsetY);
    const w = cellEdge(c.x + 1, size, view.offsetX) - x;
    boxes.push({ x, y, w, h: cellEdge(c.y + 1, size, view.offsetY) - y });
  }
  return boxes;
}
