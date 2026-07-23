import { MapRenderer } from './MapRenderer.js';
import { overlayList } from './TileGrid.js';

/** @typedef {import('../types/map.js').MapNode} MapNode */

/**
 * Export a node's map as a PNG image: render the full extent to an offscreen
 * canvas at tile resolution and hand it to the browser as a download. GM/Build
 * only (enforced by the caller's UI placement) — the render ignores fog, so a
 * player-facing export would leak the whole map.
 */

/**
 * Every image the node's tiles reference (bases and overlays), deduplicated.
 * Pure; the seam the renderer preloads through before drawing.
 * @param {MapNode} node
 * @returns {string[]}
 */
export function collectImageRefs(node) {
  const refs = new Set();
  for (const tile of node.tiles) {
    if (tile.imageRef) refs.add(tile.imageRef);
    for (const ref of overlayList(tile)) refs.add(ref);
  }
  return [...refs];
}

/**
 * A safe download filename from a node name: word characters and dashes only,
 * with a fallback for names that sanitize away entirely. Pure.
 * @param {string} name
 * @returns {string}
 */
export function exportFilename(name) {
  const slug = name
    .replace(/[^\w-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return `${slug || 'map'}.png`;
}

/**
 * Render a node's full extent to a fresh canvas at `tileSize` pixels per tile,
 * fog ignored. Tile images are preloaded into the renderer's cache first, so
 * the single render pass draws real art instead of placeholders; an image that
 * fails to load falls back to the renderer's placeholder fill.
 * @param {MapNode} node
 * @param {{
 *   tileSize?: number,
 *   regionGroups?: import('./RegionGroups.js').RegionGroup[],
 *   getNodeName?: (nodeId: string) => string | undefined,
 * }} [options]
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function renderNodeToCanvas(node, options = {}) {
  const tileSize = options.tileSize ?? 64;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, node.width * tileSize);
  canvas.height = Math.max(1, node.height * tileSize);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2d context unavailable.');

  const renderer = new MapRenderer(ctx, { tileSize, getNodeName: options.getNodeName });
  await Promise.all(
    collectImageRefs(node).map(async (ref) => {
      const img = new Image();
      img.src = `/${ref}`;
      try {
        await img.decode();
      } catch {
        // Missing/broken art: leave the image incomplete so the renderer
        // draws its placeholder fill for that tile instead of failing.
      }
      renderer.imageCache.set(ref, img);
    }),
  );

  renderer.render({
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
    node,
    regionGroups: options.regionGroups ?? [],
    offsetX: 0,
    offsetY: 0,
    scale: 1,
    revealAll: true,
    markerRange: 0,
    partyTileId: null,
    encounterTileIds: [],
    selectedTileId: null,
    cursorCellId: null,
    focused: false,
    marquee: null,
  });
  return canvas;
}

/**
 * Trigger a browser download of a canvas as a PNG file.
 * @param {HTMLCanvasElement} canvas
 * @param {string} filename
 */
export function downloadCanvasPNG(canvas, filename) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }, 'image/png');
}
