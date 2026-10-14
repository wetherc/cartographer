import { el } from './dom.js';
import { MapRenderer } from '../map/MapRenderer.js';
import { TileRaster } from '../map/TileRaster.js';
import { fightFrame } from '../map/FightFrame.js';

/** @typedef {import('../types/map.js').MapNode} MapNode */

/** The tiles shown on each side of the fight tile. */
const RADIUS = 4;

/** The canvas side in CSS pixels. */
const SIDE = 320;

/**
 * @typedef {{
 *   node: MapNode,
 *   partyTileId: string | null,
 *   encounterTileIds: string[],
 *   revealAll: boolean,
 *   fogDim: boolean,
 *   markerRange: number,
 *   label: string,
 * }} CombatMapView
 */

/**
 * A read-only map of the fight area for the combat screen. It draws the
 * party node with the same MapRenderer as the main map, centered on the
 * fight tile, with no pan, zoom, or click handling. `getView` returns null
 * when no fight runs, and the canvas then stays blank. The view names the fog
 * style and the marker range, which follow the Play map.
 * @param {() => CombatMapView | null} getView
 * @returns {{ element: HTMLElement, update: () => void }}
 */
export function mountCombatMap(getView) {
  const canvas = /** @type {HTMLCanvasElement} */ (el('canvas', 'combat-map__canvas'));
  canvas.setAttribute('role', 'img');
  const ctx = canvas.getContext('2d');
  // One raster cache for every rebuild of the renderer, so a new tile size
  // does not decode the art again.
  const raster = new TileRaster({ onLoad: () => draw() });
  /** @type {MapRenderer | null} */
  let renderer = null;

  function draw() {
    const view = getView();
    if (!ctx || !view) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(SIDE * ratio);
    canvas.height = Math.round(SIDE * ratio);
    const frame = fightFrame(view.node, view.partyTileId, canvas.width, canvas.height, RADIUS);
    if (!renderer || renderer.tileSize !== frame.tileSize) {
      renderer = new MapRenderer(ctx, { tileSize: frame.tileSize, raster });
    }
    renderer.render({
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      node: view.node,
      regionGroups: [],
      offsetX: frame.offsetX,
      offsetY: frame.offsetY,
      scale: 1,
      revealAll: view.revealAll,
      fogDim: view.fogDim,
      markerRange: view.markerRange,
      partyTileId: view.partyTileId,
      encounterTileIds: view.encounterTileIds,
      selectedTileId: null,
      cursorCellId: null,
      focused: false,
      pixelRatio: ratio,
    });
    canvas.setAttribute('aria-label', view.label);
  }

  return { element: el('div', 'combat-map', canvas), update: draw };
}
