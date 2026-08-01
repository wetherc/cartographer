import { MapRenderer, imageSrcForRef } from './MapRenderer.js';
import { overlayList } from './TileGrid.js';
import { downloadBlob } from '../storage/fileIO.js';

/** @typedef {import('../types/map.js').MapNode} MapNode */

/**
 * Export a node's map as a PNG image. This draws the full extent to an
 * offscreen canvas at tile resolution and hands it to the browser as a
 * download. It is GM and Build mode only, enforced by the caller's UI
 * placement. The draw ignores fog of war, so a player-facing export leaks
 * the whole map.
 */

/**
 * Every image the node's tiles reference, both base tiles and overlays,
 * with duplicates removed. This is a pure function. The renderer preloads
 * images through it before drawing.
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
 * A safe download filename from a node name. It keeps only word characters
 * and dashes, with a fallback for names that reduce to nothing. This is a
 * pure function.
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
 * The refs an export still must decode, given the images a live renderer
 * already holds. An entry that is present but not `complete` is still
 * loading, so the export loads its own copy instead of drawing a blank tile.
 * This is a pure function.
 * @param {string[]} refs
 * @param {Map<string, HTMLImageElement>} [cache]
 * @returns {string[]}
 */
export function refsToDecode(refs, cache) {
  if (!cache) return refs;
  return refs.filter((ref) => !cache.get(ref)?.complete);
}

/**
 * Draw a node's full extent to a fresh canvas at `tileSize` pixels per tile,
 * with fog of war ignored. Tile images are preloaded into the renderer's
 * cache first, so the single draw pass shows real art instead of
 * placeholders. An image that fails to load falls back to the renderer's
 * placeholder fill. Pass the live canvas's `imageCache` to reuse the art it
 * already decoded. For a built-in-tile map that is every image, so the
 * export decodes nothing.
 * @param {MapNode} node
 * @param {{
 *   tileSize?: number,
 *   regionGroups?: import('./RegionGroups.js').RegionGroup[],
 *   getNodeName?: (nodeId: string) => string | undefined,
 *   imageCache?: Map<string, HTMLImageElement>,
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
  const refs = collectImageRefs(node);
  // Seed from the live cache first, then fill the gaps. Copy the entries in
  // instead of sharing the cache, so the export never writes into the cache
  // the live canvas draws from.
  for (const ref of refs) {
    const decoded = options.imageCache?.get(ref);
    if (decoded?.complete) renderer.imageCache.set(ref, decoded);
  }
  await Promise.all(
    refsToDecode(refs, options.imageCache).map(async (ref) => {
      const img = new Image();
      img.src = imageSrcForRef(ref);
      try {
        await img.decode();
      } catch {
        // Art is missing or broken. Leave the image incomplete so the
        // renderer draws its placeholder fill for that tile instead of failing.
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
    if (blob) downloadBlob(blob, filename);
  }, 'image/png');
}
