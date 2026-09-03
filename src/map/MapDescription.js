import { parseCoords } from './MapGeometry.js';
import { describeTile, toDisplay } from './TileCoords.js';
import { getTile } from './TileGrid.js';
import { capitalize } from '../util/text.js';

/** @typedef {import('../types/map.js').MapNode} MapNode */
/** @typedef {import('../types/map.js').PartyPosition} PartyPosition */
/** @typedef {import('../types/map.js').POIType} POIType */

/**
 * Convert "general-store" to "General store" for a spoken description.
 * @param {string} poiType
 * @returns {string}
 */
function readablePoi(poiType) {
  return capitalize(poiType.replace(/-/g, ' '));
}

/**
 * Build a plain-text description of a map node for screen readers and any
 * non-visual surface, because the map itself is an opaque canvas. The
 * description reports the node name and size, how much is explored, where
 * the party stands, and the points of interest with their notes. In Play
 * mode (revealAll false), the description covers only revealed tiles, to
 * match what a sighted player can see through the fog. In Build mode
 * (revealAll true), the description covers everything.
 * @param {MapNode} node
 * @param {PartyPosition | null} party
 * @param {{ revealAll?: boolean }} [options]
 * @returns {string}
 */
export function describeNode(node, party, options = {}) {
  const revealAll = options.revealAll ?? false;
  const total = node.width * node.height;

  // This is one pass over the tiles. The placed count, the revealed count, and
  // the points of interest all read the same grid-tile scan, and each needs
  // the id parsed. Splitting the pass costs three filtered copies of the
  // tile list, a fourth array for the description phrases, and a second parse
  // per point of interest, on every party step and at the end of every stroke.
  let placed = 0;
  let revealed = 0;
  /** @type {{ poiType: POIType, x: number, y: number, notes: string }[]} */
  const pois = [];
  for (const tile of node.tiles) {
    const coords = parseCoords(tile.id);
    if (!coords) continue;
    placed++;
    if (tile.revealed) revealed++;
    if (tile.metadata.poiType && (revealAll || tile.revealed)) {
      pois.push({
        poiType: tile.metadata.poiType,
        x: coords.x,
        y: coords.y,
        notes: tile.metadata.notes,
      });
    }
  }

  const kindPhrase = node.kind === 'interior' ? 'an interior' : 'a region';
  const environ = node.environ ? ` (${node.environ})` : '';
  const parts = [`${node.name}, ${kindPhrase}${environ}, ${node.width} by ${node.height} tiles.`];

  parts.push(
    revealAll ? `${placed} of ${total} tiles placed.` : `${revealed} of ${total} tiles explored.`,
  );

  if (party && party.nodeId === node.id) {
    const coords = parseCoords(party.tileId);
    if (coords) parts.push(`Party at column ${toDisplay(coords.x)}, row ${toDisplay(coords.y)}.`);
  }

  if (pois.length) {
    const listed = pois.map((poi) => {
      const notes = poi.notes ? `: ${poi.notes}` : '';
      return `${readablePoi(poi.poiType)} at column ${toDisplay(poi.x)}, row ${toDisplay(poi.y)}${notes}`;
    });
    parts.push(`Points of interest: ${listed.join('; ')}.`);
  }

  return parts.join(' ');
}

/**
 * Build the one-line narration of the keyboard cursor for a live region. An
 * arrow key that moves the cursor is otherwise silent: the map description
 * above reports the node and the party, not the cell that Enter acts on. The
 * line names the cell in the 1-based column and row a GM reads elsewhere,
 * then what stands there. In Play mode (revealAll false) an unexplored cell
 * reports only that it is unexplored, so the cursor cannot read through the
 * fog. In Build mode (revealAll true) every cell reports its art, its point
 * of interest, and its fog state. `labelFor` turns a tile's image reference
 * into the palette label, since this module does not hold the palette.
 * @param {MapNode} node
 * @param {string} tileId
 * @param {{ revealAll?: boolean, labelFor?: (imageRef: string) => string | undefined }} [options]
 * @returns {string}
 */
export function describeCursor(node, tileId, options = {}) {
  const revealAll = options.revealAll ?? false;
  const where = `Cursor at ${describeTile(tileId)}`;
  const tile = getTile(node, tileId);
  if (!tile) return `${where}: empty.`;
  if (!revealAll && !tile.revealed) return `${where}: unexplored.`;
  const parts = [options.labelFor?.(tile.imageRef) ?? tile.imageRef];
  if (tile.metadata.poiType) parts.push(readablePoi(tile.metadata.poiType));
  if (revealAll) parts.push(tile.revealed ? 'explored' : 'unexplored');
  return `${where}: ${parts.join(', ')}.`;
}
