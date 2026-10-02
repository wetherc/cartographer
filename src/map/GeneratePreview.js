import { labelSize } from './CanvasText.js';
import { COORD_SCALE } from './CoordLabels.js';

/** @typedef {import('../types/map.js').Tile} Tile */
/** @typedef {import('../types/map.js').GeneratedSite} GeneratedSite */

/** The smallest tile, in canvas px, that gets coordinate labels (CoordLabels.js). */
const MIN_LABELLED_TILE = 20;

/**
 * The tile size and offsets of a generated map in the square preview canvas
 * of the Generate dialog. A map that fills the canvas pins the column labels
 * and the row labels over its first row and column, and the labels of
 * column 1 and row 1 meet in the corner, so the renderer leaves both out. A
 * gutter on the top and left keeps the labels outside the grid. The gutter
 * is wide enough for the label pad of the coordinate layout, which is 1.8
 * times the font size. A map whose tiles get too small for labels with the
 * gutter fills the canvas instead.
 * @param {number} canvasSize the side of the canvas in px
 * @param {number} width the map width in tiles
 * @param {number} height the map height in tiles
 * @returns {{ tileSize: number, offsetX: number, offsetY: number }}
 */
export function previewFrame(canvasSize, width, height) {
  const longest = Math.max(1, width, height);
  const full = Math.max(1, Math.floor(canvasSize / longest));
  const gutter = Math.ceil(1.8 * labelSize(full, COORD_SCALE)) + 2;
  const inset = Math.floor((canvasSize - gutter) / longest);
  const [tileSize, start] = inset >= MIN_LABELLED_TILE ? [inset, gutter] : [full, 0];
  const room = canvasSize - start;
  return {
    tileSize,
    offsetX: start + Math.floor((room - width * tileSize) / 2),
    offsetY: start + Math.floor((room - height * tileSize) / 2),
  };
}

/**
 * The tiles of a generated map with each site linked to its own placeholder
 * id. Generate links each site to a new child map, and the preview then
 * draws the outline of each linked block, such as the regions of the World
 * archetype. A map with no sites returns its tiles unchanged.
 * @param {Tile[]} tiles
 * @param {GeneratedSite[]} [sites]
 * @returns {Tile[]}
 */
export function previewRegionTiles(tiles, sites = []) {
  /** @type {Map<string, string>} */
  const linkOf = new Map();
  sites.forEach((site, i) => {
    for (const id of site.tileIds) linkOf.set(id, `preview-site-${i}`);
  });
  if (linkOf.size === 0) return tiles;
  return tiles.map((tile) => {
    const link = linkOf.get(tile.id);
    return link ? { ...tile, childNodeId: link } : tile;
  });
}
