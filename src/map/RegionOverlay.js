import { blockRect, cellEdge, newBlockRect } from './MapGeometry.js';
import { groupOutline, regionSlots } from './RegionOutline.js';
import { INK } from './CanvasInk.js';
import { drawPlatedLabels, labelFont } from './CanvasText.js';
import {
  regionBorderWidth,
  regionCellBoxes,
  regionLabelMetrics,
  regionNameLayout,
} from './RegionOverlayLayout.js';

/** @typedef {import('./MapRenderer.js').MapView} MapView */

/**
 * Draw the region overlays of the node in view: a tint over each region's
 * cells and a border along its outline. `renderRegionNames` draws the names
 * in a later pass, over the selection outline. Each region takes the
 * color of its `regionSlots` slot, so two regions that share a border show
 * two colors. The tint and the border are clipped to the region's cells.
 * Under solid fog they are also clipped to the cells the party has
 * revealed, so a Player view never shows the extent of a region through
 * the fog. The GM see-through fog passes no revealed set, so the full
 * regions draw. The border line is twice its drawn width and centered on
 * the cell edge, and the clip keeps only the inner half. Two regions that
 * touch then each draw their own color on their own side of the shared
 * edge. Under solid fog, a region with no revealed cell draws
 * nothing, so the world map does not show where each unexplored region is.
 * @param {CanvasRenderingContext2D} ctx
 * @param {MapView} view
 * @param {import('./TileIndex.js').RevealedIds | null} revealedIds the revealed tile ids, or null in Build mode and under see-through fog
 * @param {number} tileSize base tile size in buffer px at scale 1
 */
export function renderRegionOverlays(ctx, view, revealedIds, tileSize) {
  if (!view.node || view.regionGroups.length === 0) return;
  const size = tileSize * view.scale;
  // The view's groups, not the groups of view.node. During a stroke the
  // canvas keeps the groups from before the stroke, and a region paint
  // stroke gives view.node new links on every cell.
  const slots = regionSlots(view.regionGroups);
  const rect = newBlockRect();
  const px = view.pixelRatio ?? 1;
  for (const group of view.regionGroups) {
    blockRect(rect, group, view, size);
    if (!rect.visible) continue;
    const cells = regionCellBoxes(group, view, size, revealedIds);
    if (cells.length === 0) continue;
    const clip = new Path2D();
    for (const c of cells) clip.rect(c.x, c.y, c.w, c.h);
    const hue = INK.regionHues[(slots.get(group.childNodeId) ?? 0) % INK.regionHues.length];
    // The target of the Link tool draws its tint three times over and a
    // wider border, so its cells stand out from the other regions.
    const emphasis = group.childNodeId === view.highlightRegionId ? 3 : 1;

    ctx.save();
    ctx.clip(clip);
    ctx.fillStyle = hue.tint;
    for (let i = 0; i < emphasis; i++) ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    const outline = new Path2D();
    for (const e of groupOutline(group)) {
      outline.moveTo(cellEdge(e.x1, size, view.offsetX), cellEdge(e.y1, size, view.offsetY));
      outline.lineTo(cellEdge(e.x2, size, view.offsetX), cellEdge(e.y2, size, view.offsetY));
    }
    const width = regionBorderWidth(size, px, emphasis > 1);
    ctx.lineCap = 'square';
    ctx.strokeStyle = INK.regionRim;
    ctx.lineWidth = width * 2 + 2 * px;
    ctx.stroke(outline);
    ctx.strokeStyle = hue.border;
    ctx.lineWidth = width * 2;
    ctx.stroke(outline);
    ctx.restore();
  }
}

/**
 * Draw the name of each region, after every tint and after the selection
 * outline, so neither a later region's tint nor the outline crosses a name.
 * A name draws outside the region's clip, centered over the region. In Play
 * mode only the revealed cells count, so the plate never centers on fog.
 * When the center would cover a cell of another region, another name, the
 * party token, a character token, or a visible creature marker, the name
 * tries the spot centered just above the region and then just below it.
 * With no clear spot, the name is left out until a zoom makes room, and the
 * caller gets its child node id so the map hover can name the place. The
 * layout covers the regions out of view too, so a name does not change spot
 * when a pan moves another region off the canvas. After the layout,
 * `keepClearOfEdges` slides a name off the pinned coordinate digits, or
 * leaves it out when its region is out of view.
 * @param {CanvasRenderingContext2D} ctx
 * @param {MapView} view
 * @param {import('./TileIndex.js').RevealedIds | null} revealedIds
 * @param {number} tileSize base tile size in buffer px at scale 1
 * @param {((nodeId: string) => string | undefined) | undefined} getNodeName
 * @param {string[]} [blockedIds] tiles with a token or marker, which no name plate covers
 * @returns {string[]} the child node ids of the names left out for lack of room
 */
export function renderRegionNames(ctx, view, revealedIds, tileSize, getNodeName, blockedIds = []) {
  if (!view.node || !getNodeName || view.regionGroups.length === 0) return [];
  const { fontSize, padX, padY } = regionLabelMetrics(view.pixelRatio ?? 1);
  ctx.save();
  ctx.font = labelFont(fontSize, '400');
  const measure = (/** @type {string} */ name) => ctx.measureText(name).width;
  const { placed, hidden } = regionNameLayout(
    view,
    revealedIds,
    tileSize,
    getNodeName,
    blockedIds,
    measure,
  );
  ctx.restore();
  drawPlatedLabels(
    ctx,
    placed.map(({ name, box }) => ({ text: name, x: box.x + padX, y: box.y + padY })),
    {
      fontSize,
      weight: '400',
      align: 'left',
      baseline: 'top',
      plate: 'rect',
      plateColor: INK.regionLabelPlate,
      color: INK.regionLabelText,
      padX,
      padY,
    },
  );
  return hidden;
}
