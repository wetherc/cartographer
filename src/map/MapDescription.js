import { parseCoords } from './MapGeometry.js';
import { capitalize } from '../util/text.js';

/** @typedef {import('../types/map.js').MapNode} MapNode */
/** @typedef {import('../types/map.js').PartyPosition} PartyPosition */
/** @typedef {import('../types/map.js').POIType} POIType */

/**
 * "general-store" -> "General store" for a spoken description.
 * @param {string} poiType
 * @returns {string}
 */
function readablePoi(poiType) {
  return capitalize(poiType.replace(/-/g, ' '));
}

/**
 * A plain-text description of a map node for screen readers and any non-visual
 * surface, since the map itself is an opaque <canvas>. Reports the node name and
 * size, how much is explored, where the party stands, and the points of
 * interest with their notes. In Play mode (revealAll false) only revealed tiles
 * are described, matching what a sighted player can see through the fog; in
 * Build mode (revealAll true) everything is described.
 * @param {MapNode} node
 * @param {PartyPosition | null} party
 * @param {{ revealAll?: boolean }} [options]
 * @returns {string}
 */
export function describeNode(node, party, options = {}) {
  const revealAll = options.revealAll ?? false;
  const total = node.width * node.height;

  // One pass over the tiles: the placed count, the revealed count, and the points
  // of interest all read the same grid-tile scan, and every one of them needs the
  // id parsed. Splitting them cost three filtered copies of the tile list, a
  // fourth array for the rendered phrases, and a second parse per point of
  // interest — on every party step and at the end of every paint stroke.
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
    if (coords) parts.push(`Party at column ${coords.x + 1}, row ${coords.y + 1}.`);
  }

  if (pois.length) {
    const listed = pois.map((poi) => {
      const notes = poi.notes ? `: ${poi.notes}` : '';
      return `${readablePoi(poi.poiType)} at column ${poi.x + 1}, row ${poi.y + 1}${notes}`;
    });
    parts.push(`Points of interest: ${listed.join('; ')}.`);
  }

  return parts.join(' ');
}
