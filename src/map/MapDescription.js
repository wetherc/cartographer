import { parseCoords } from './MapGeometry.js';
import { describeTile, toDisplay } from './TileCoords.js';
import { getTile } from './TileGrid.js';
import { capitalize } from '../util/text.js';

/** @typedef {import('../types/map.js').MapNode} MapNode */
/** @typedef {import('../types/map.js').PartyPosition} PartyPosition */
/** @typedef {import('../types/map.js').POIType} POIType */
/** @typedef {import('../types/map.js').Tile} Tile */

/**
 * What a description may name. `revealAll` is Build mode, where every tile
 * and every point of interest is named. `showNotes` is true for a GM tab.
 * `markerVisible` is the canvas's detection range test, the same test that
 * decides whether a point of interest outline draws.
 * @typedef {{
 *   revealAll?: boolean,
 *   showNotes?: boolean,
 *   markerVisible?: (tileId: string) => boolean,
 * }} DescribeOptions
 */

/**
 * Convert "general-store" to "General store" for a spoken description.
 * @param {string} poiType
 * @returns {string}
 */
function readablePoi(poiType) {
  return capitalize(poiType.replace(/-/g, ' '));
}

/**
 * Whether a description may name the point of interest on a tile. Play mode
 * uses the same rules as the hover tooltip. The tile has to be revealed, a
 * discoverable point has to be discovered, and the tile has to be within
 * detection range. Otherwise a screen reader on the table display names a
 * secret that the canvas keeps hidden.
 * @param {Tile} tile
 * @param {DescribeOptions} options
 * @returns {boolean}
 */
function poiNamed(tile, options) {
  if (!tile.metadata.poiType) return false;
  if (options.revealAll) return true;
  if (!tile.revealed) return false;
  if (tile.metadata.discoverable && !tile.metadata.discovered) return false;
  return options.markerVisible?.(tile.id) ?? true;
}

/**
 * Build a plain-text description of a map node for screen readers and any
 * non-visual view, because the map itself is an opaque canvas. The
 * description reports the node name and size, how much is explored, where
 * the party stands, and the points of interest. In Play mode (revealAll
 * false), the description names only the points of interest that the
 * tooltip names (see `poiNamed`). In Build mode (revealAll true), the
 * description covers everything. The GM's notes are read only when
 * `showNotes` or `revealAll` is set, because a player tab never shows them.
 * @param {MapNode} node
 * @param {PartyPosition | null} party
 * @param {DescribeOptions} [options]
 * @returns {string}
 */
export function describeNode(node, party, options = {}) {
  const revealAll = options.revealAll ?? false;
  const showNotes = revealAll || (options.showNotes ?? false);
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
    if (poiNamed(tile, options)) {
      pois.push({
        poiType: /** @type {POIType} */ (tile.metadata.poiType),
        x: coords.x,
        y: coords.y,
        notes: showNotes ? tile.metadata.notes : '',
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
 * fog, and a point of interest is named under the same rules as in
 * `describeNode`. In Build mode (revealAll true) every cell reports its art,
 * its point of interest, and its fog state. `labelFor` turns a tile's image
 * reference into the palette label, since this module does not keep the
 * palette.
 * @param {MapNode} node
 * @param {string} tileId
 * @param {DescribeOptions & { labelFor?: (imageRef: string) => string | undefined }} [options]
 * @returns {string}
 */
export function describeCursor(node, tileId, options = {}) {
  const revealAll = options.revealAll ?? false;
  const where = `Cursor at ${describeTile(tileId)}`;
  const tile = getTile(node, tileId);
  if (!tile) return `${where}: empty.`;
  if (!revealAll && !tile.revealed) return `${where}: unexplored.`;
  const parts = [options.labelFor?.(tile.imageRef) ?? tile.imageRef];
  if (poiNamed(tile, options))
    parts.push(readablePoi(/** @type {POIType} */ (tile.metadata.poiType)));
  if (revealAll) parts.push(tile.revealed ? 'explored' : 'unexplored');
  return `${where}: ${parts.join(', ')}.`;
}
