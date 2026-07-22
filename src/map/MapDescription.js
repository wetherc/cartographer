import { parseCoords } from './MapCanvas.js';

/** @typedef {import('../types/map.js').MapNode} MapNode */
/** @typedef {import('../types/map.js').PartyPosition} PartyPosition */

/**
 * "general-store" -> "General store" for a spoken description.
 * @param {string} poiType
 * @returns {string}
 */
function readablePoi(poiType) {
  const words = poiType.replace(/-/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
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
  const gridTiles = node.tiles.filter((t) => parseCoords(t.id));
  const total = node.width * node.height;
  const revealed = gridTiles.filter((t) => t.revealed).length;

  const kindPhrase = node.kind === 'interior' ? 'an interior' : 'a region';
  const environ = node.environ ? ` (${node.environ})` : '';
  const parts = [`${node.name}, ${kindPhrase}${environ}, ${node.width} by ${node.height} tiles.`];

  parts.push(
    revealAll
      ? `${gridTiles.length} of ${total} tiles placed.`
      : `${revealed} of ${total} tiles explored.`,
  );

  if (party && party.nodeId === node.id) {
    const coords = parseCoords(party.tileId);
    if (coords) parts.push(`Party at column ${coords.x + 1}, row ${coords.y + 1}.`);
  }

  const pois = gridTiles.filter(
    (t) => t.metadata.poiType && (revealAll || t.revealed),
  );
  if (pois.length) {
    const listed = pois.map((t) => {
      const coords = parseCoords(t.id);
      const where = coords ? ` at column ${coords.x + 1}, row ${coords.y + 1}` : '';
      const notes = t.metadata.notes ? `: ${t.metadata.notes}` : '';
      return `${readablePoi(/** @type {string} */ (t.metadata.poiType))}${where}${notes}`;
    });
    parts.push(`Points of interest: ${listed.join('; ')}.`);
  }

  return parts.join(' ');
}
