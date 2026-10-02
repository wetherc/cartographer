import { el } from './dom.js';
import { INK } from '../map/CanvasInk.js';
import { compassArea, miniMapStartsOpen, miniMapTileSize, paintTerrain } from '../map/MiniMap.js';
import { groupOutline } from '../map/RegionOutline.js';
import { TileRaster } from '../map/TileRaster.js';
import { writeStored } from '../storage/Footprint.js';

/** @typedef {import('../map/MiniMap.js').MiniMapView} MiniMapView */
/** @typedef {import('../types/map.js').MapNode} MapNode */

/** The longest side of the mini-map, in CSS pixels. */
const MAX_SIDE = 176;

/** localStorage key of the mini-map choice: `1` hidden, `0` shown, absent the default. */
const HIDDEN_KEY = 'campaign-builder:minimap-hidden';

/**
 * Mount the mini-map: a small picture of the parent of the node in view,
 * pinned to the top-left corner of the map. It outlines the block of parent
 * cells that leads into the node and puts a dot where the party is. The
 * parent draws one small image per tile, so the picture costs one draw pass
 * per parent node object and fog rule. A party step inside the node redraws
 * only the outline and the dot over a cached copy of that pass.
 *
 * The caller decides what to show through `getView` and `revealAll`, and
 * calls `update` after anything that can change either one. `toggle` shows
 * or hides the mini-map, and the choice persists per browser. `isAvailable`
 * is false while the node in view has no parent view to show, such as the
 * world map or a map that no tile links to.
 * @param {HTMLElement} container
 * @param {{
 *   getView: () => MiniMapView | null,
 *   revealAll: () => boolean,
 * }} options
 * @returns {{ update: () => void, isOpen: () => boolean, isAvailable: () => boolean, toggle: () => void, element: HTMLElement }}
 */
export function mountMiniMap(container, options) {
  const canvas = el('canvas', 'minimap__canvas');
  canvas.setAttribute('role', 'img');
  // The canvas label already names the parent, so the caption is visual only.
  const caption = el('figcaption', 'minimap__caption');
  caption.setAttribute('aria-hidden', 'true');
  const root = el('figure', 'minimap', canvas, caption);
  root.hidden = true;
  container.appendChild(root);
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));

  /**
   * Each ref rasterizes once per tile size, so a pass over thousands of
   * tiles copies pixels instead of running the SVG rasterizer per tile. A
   * load that finishes drops the cached passes, so the next frame draws the
   * real art.
   */
  const raster = new TileRaster({ onLoad: scheduleRedraw });
  /**
   * The terrain passes, one for Build mode and one for Play, so a mode
   * switch reuses the pass of the mode it returns to. Each is reused while
   * the parent object and the tile size stay the same.
   * @type {Map<boolean, { parent: MapNode, size: number, pixels: HTMLCanvasElement }>}
   */
  const bases = new Map();
  let loadPending = false;
  let open = miniMapStartsOpen(
    localStorage.getItem(HIDDEN_KEY),
    matchMedia('(max-width: 40rem)').matches,
  );

  function toggle() {
    open = !open;
    writeStored(HIDDEN_KEY, open ? '0' : '1');
    update();
  }

  // Many tiles finish loading in the same frame. One redraw covers them all.
  function scheduleRedraw() {
    if (loadPending) return;
    loadPending = true;
    requestAnimationFrame(() => {
      loadPending = false;
      bases.clear();
      update();
    });
  }

  /**
   * The terrain pass of `parent` at `size` device pixels per tile, in an
   * offscreen canvas.
   * @param {MapNode} parent
   * @param {number} size
   * @param {boolean} revealAll
   */
  function drawBase(parent, size, revealAll) {
    const pixels = document.createElement('canvas');
    pixels.width = parent.width * size;
    pixels.height = parent.height * size;
    const pctx = /** @type {CanvasRenderingContext2D} */ (pixels.getContext('2d'));
    paintTerrain(pctx, parent, size, revealAll, (ref) => raster.source(ref, size, size));
    return pixels;
  }

  /**
   * The outline of the block and the party dot, over the terrain.
   * @param {MiniMapView} view
   * @param {number} size
   */
  function drawMarks(view, size) {
    const line = 1.5 * (window.devicePixelRatio || 1);
    ctx.save();
    ctx.lineCap = 'square';
    // The dark rim under the gold line keeps the outline visible over bright terrain.
    ctx.beginPath();
    for (const edge of groupOutline(view.group)) {
      ctx.moveTo(edge.x1 * size, edge.y1 * size);
      ctx.lineTo(edge.x2 * size, edge.y2 * size);
    }
    ctx.lineWidth = line * 2.5;
    ctx.strokeStyle = INK.regionRim;
    ctx.stroke();
    ctx.lineWidth = line;
    ctx.strokeStyle = INK.goldLit;
    ctx.stroke();
    if (view.partyCell) {
      const { x, y } = view.partyCell;
      ctx.beginPath();
      ctx.arc(
        (x + 0.5) * size,
        (y + 0.5) * size,
        Math.max(line * 2.5, size * 0.45),
        0,
        Math.PI * 2,
      );
      ctx.fillStyle = INK.gold;
      ctx.fill();
      ctx.strokeStyle = INK.goldRim;
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * The screen-reader text of the picture.
   * @param {MiniMapView} view
   */
  function describe(view) {
    const { parent, partyCell } = view;
    if (!partyCell) return `Mini-map of ${parent.name}.`;
    return `Mini-map of ${parent.name}. The party is in the ${compassArea(partyCell, parent.width, parent.height)} of it.`;
  }

  let available = false;

  function update() {
    const view = options.getView();
    available = view !== null;
    root.hidden = !open || !view;
    if (!open || !view) return;
    const { parent } = view;
    const scale = window.devicePixelRatio || 1;
    const size = miniMapTileSize(parent.width, parent.height, MAX_SIDE * scale);
    const revealAll = options.revealAll();
    let base = bases.get(revealAll);
    if (!base || base.parent !== parent || base.size !== size) {
      base = { parent, size, pixels: drawBase(parent, size, revealAll) };
      bases.set(revealAll, base);
    }
    const { pixels } = base;
    if (canvas.width !== pixels.width || canvas.height !== pixels.height) {
      canvas.width = pixels.width;
      canvas.height = pixels.height;
      canvas.style.width = `${pixels.width / scale}px`;
    }
    ctx.drawImage(pixels, 0, 0);
    drawMarks(view, size);
    caption.textContent = parent.name;
    canvas.setAttribute('aria-label', describe(view));
  }

  return { update, isOpen: () => open, isAvailable: () => available, toggle, element: root };
}
