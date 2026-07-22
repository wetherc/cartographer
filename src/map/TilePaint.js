import { createTile, getTile, setTile } from './TileGrid.js';
import { parseCoords } from './MapCanvas.js';

/** @typedef {import('../types/map.js').MapNode} MapNode */

/**
 * Whether an "x,y" tile id falls inside a node's width x height grid. Painting
 * and erasing are no-ops outside these bounds, so a stray click past the map
 * edge can't create a tile floating outside the authored area.
 * @param {MapNode} node
 * @param {string} tileId
 * @returns {boolean}
 */
export function isInBounds(node, tileId) {
  const coords = parseCoords(tileId);
  if (!coords) return false;
  return coords.x >= 0 && coords.y >= 0 && coords.x < node.width && coords.y < node.height;
}

/**
 * Paint a tile's image at tileId, returning a new node. Painting over an
 * existing tile changes only its imageRef and keeps its metadata, childNodeId,
 * and revealed state, so re-terraining a tile never wipes the notes or region
 * link a GM already set on it. A brand-new tile starts unrevealed (fog), so
 * authored maps still reveal through play rather than starting fully explored.
 * Out-of-bounds ids are ignored.
 * @param {MapNode} node
 * @param {string} tileId
 * @param {string} imageRef
 * @returns {MapNode}
 */
export function paintTile(node, tileId, imageRef) {
  if (!isInBounds(node, tileId)) return node;
  const existing = getTile(node, tileId);
  const tile = existing ? { ...existing, imageRef } : createTile(tileId, imageRef);
  return setTile(node, tile);
}

/**
 * Remove the tile at tileId, returning a new node. No-op if no tile is there.
 * @param {MapNode} node
 * @param {string} tileId
 * @returns {MapNode}
 */
export function eraseTile(node, tileId) {
  if (!getTile(node, tileId)) return node;
  return { ...node, tiles: node.tiles.filter((t) => t.id !== tileId) };
}
