import { INK } from './CanvasInk.js';
import { frontierIds } from './FogOfWar.js';
import { parseCoords } from './MapGeometry.js';
import { blockFor } from './MapExits.js';
import { projectBack } from './RegionCrossing.js';
import { overlayList } from './TileGrid.js';

/** @typedef {import('../types/map.js').MapNode} MapNode */
/** @typedef {import('../types/map.js').PartyPosition} PartyPosition */
/** @typedef {import('./RegionGroups.js').RegionGroup} RegionGroup */

/**
 * What the mini-map shows for the node in view: its parent, the block of
 * parent cells that links to the node, and the parent cell where the party
 * is, or null when the party is somewhere else.
 * @typedef {{
 *   parent: MapNode,
 *   group: RegionGroup,
 *   partyCell: { x: number, y: number } | null,
 * }} MiniMapView
 */

/**
 * The parent cell that matches a cell of the child map. Each axis of the
 * child scales onto the block's bounding box, the same projection that a
 * walk off the edge of the child uses. A painted block can have any outline,
 * so the result then moves to the nearest cell of the block. The first cell
 * in the block's order wins a tie.
 * @param {RegionGroup} group
 * @param {MapNode} child
 * @param {{ x: number, y: number }} at cell in the child
 * @returns {{ x: number, y: number }}
 */
export function approximateCell(group, child, at) {
  const x = projectBack(at.x, child.width, group.minX, group.maxX);
  const y = projectBack(at.y, child.height, group.minY, group.maxY);
  let best = group.cells[0];
  let bestDistance = Infinity;
  for (const cell of group.cells) {
    const distance = (cell.x - x) ** 2 + (cell.y - y) ** 2;
    if (distance < bestDistance) {
      best = cell;
      bestDistance = distance;
    }
  }
  return { x: best.x, y: best.y };
}

/**
 * The mini-map for `node`, or null when there is nothing to show. The world
 * has no parent, and a node that no parent tile links to has no block to
 * mark. When the party is in the node, its cell projects onto the block.
 * When the party is on the parent map, its own cell is the answer.
 * @param {MapNode} node the node in view
 * @param {MapNode | null | undefined} parent
 * @param {PartyPosition} position where the party, or the followed character, is
 * @param {string | null} [throughTileId] parent tile the traveler entered through
 * @returns {MiniMapView | null}
 */
export function miniMapView(node, parent, position, throughTileId = null) {
  if (!parent) return null;
  const group = blockFor(parent, node.id, throughTileId);
  if (!group) return null;
  const at = parseCoords(position.tileId);
  /** @type {{ x: number, y: number } | null} */
  let partyCell = null;
  if (at && position.nodeId === node.id) partyCell = approximateCell(group, node, at);
  else if (at && position.nodeId === parent.id) partyCell = at;
  return { parent, group, partyCell };
}

/**
 * The whole pixels per tile that fit a map of `width` by `height` tiles
 * inside a square of `maxSide` pixels. A tile never draws smaller than one
 * pixel, so a map wider than `maxSide` tiles draws past the square.
 * @param {number} width
 * @param {number} height
 * @param {number} maxSide
 * @returns {number}
 */
export function miniMapTileSize(width, height, maxSide) {
  return Math.max(1, Math.floor(maxSide / Math.max(1, width, height)));
}

/**
 * Whether the mini-map starts open. The stored choice wins: `'1'` means
 * hidden and `'0'` means shown. With no choice stored, a narrow window
 * starts with the mini-map hidden, because on a phone it covers about a third
 * of the map.
 * @param {string | null} stored
 * @param {boolean} narrow
 * @returns {boolean}
 */
export function miniMapStartsOpen(stored, narrow) {
  if (stored === '1') return false;
  if (stored === '0') return true;
  return !narrow;
}

/**
 * The part of a map a cell is in, as a compass word, with the map cut into
 * thirds on each axis. The screen-reader label of the mini-map uses it,
 * because a canvas dot tells assistive technology nothing.
 * @param {{ x: number, y: number }} cell
 * @param {number} width
 * @param {number} height
 * @returns {string}
 */
export function compassArea(cell, width, height) {
  /** @param {number} p @param {number} size */
  const third = (p, size) => Math.min(2, Math.floor((p * 3) / Math.max(1, size)));
  const ns = ['north', '', 'south'][third(cell.y, height)];
  const ew = ['west', '', 'east'][third(cell.x, width)];
  if (ns && ew) return `${ns}-${ew}`;
  return ns || ew || 'center';
}

/**
 * Paint every tile of `parent` into `ctx` at `size` pixels per tile. An
 * unrevealed tile paints as fog unless `revealAll` is set, so the mini-map
 * shows a player nothing the party has not seen. A base image that has not
 * loaded paints a flat placeholder, and a missing overlay paints nothing.
 *
 * `source` returns what to draw a ref with at `size` pixels, or null while
 * it loads. A caller passes a raster cache here. A world uses a few dozen
 * refs across thousands of tiles, and drawing each tile from the SVG itself
 * rasterizes the vector art again on every draw.
 * @param {Pick<CanvasRenderingContext2D, 'fillStyle' | 'fillRect' | 'drawImage'>} ctx
 * @param {MapNode} parent
 * @param {number} size
 * @param {boolean} revealAll
 * @param {(ref: string, size: number) => CanvasImageSource | null} source
 */
export function paintTerrain(ctx, parent, size, revealAll, source) {
  ctx.fillStyle = INK.mapBackdrop;
  ctx.fillRect(0, 0, parent.width * size, parent.height * size);
  const frontier = frontierIds(parent);
  for (const tile of parent.tiles) {
    const at = parseCoords(tile.id);
    if (!at) continue;
    const x = at.x * size;
    const y = at.y * size;
    if (!revealAll && !tile.revealed) {
      ctx.fillStyle = frontier.has(tile.id) ? INK.fogFrontier : INK.fog;
      ctx.fillRect(x, y, size, size);
      continue;
    }
    for (const ref of [tile.imageRef, ...overlayList(tile)]) {
      const img = ref ? source(ref, size) : null;
      if (img) ctx.drawImage(img, x, y, size, size);
      else if (ref === tile.imageRef) {
        ctx.fillStyle = INK.missingArt;
        ctx.fillRect(x, y, size, size);
      }
    }
  }
}
