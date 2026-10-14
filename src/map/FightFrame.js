import { parseCoords } from './MapGeometry.js';

/**
 * The frame of the read-only fight map on the combat screen. It fits a
 * square window of `2 * radius + 1` tiles into the canvas, centered on the
 * tile of the fight, and returns the tile size and the offsets in canvas
 * pixels that MapRenderer reads with a scale of 1. A tile id that does not
 * parse centers the whole node instead.
 * @param {{ width: number, height: number }} node
 * @param {string | null} centerTileId
 * @param {number} canvasWidth
 * @param {number} canvasHeight
 * @param {number} radius
 * @returns {{ tileSize: number, offsetX: number, offsetY: number }}
 */
export function fightFrame(node, centerTileId, canvasWidth, canvasHeight, radius) {
  const span = 2 * Math.max(0, radius) + 1;
  const tileSize = Math.max(1, Math.floor(Math.min(canvasWidth, canvasHeight) / span));
  const at = centerTileId ? parseCoords(centerTileId) : null;
  const cx = at ? at.x + 0.5 : node.width / 2;
  const cy = at ? at.y + 0.5 : node.height / 2;
  return {
    tileSize,
    offsetX: Math.round(canvasWidth / 2 - cx * tileSize),
    offsetY: Math.round(canvasHeight / 2 - cy * tileSize),
  };
}
