import { gridCellOf, parseCoords } from './MapGeometry.js';
import { describeTile, toDisplay } from './TileCoords.js';
import { getTile } from './TileGrid.js';
import { artStamp, exploredCount } from './TileIndex.js';
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
 *   placeNoun?: string | null,
 *   partyEmpty?: boolean,
 * }} DescribeOptions
 * `placeNoun` names what the node is, such as "a village" (see `placeNoun`).
 * `partyEmpty` is true when the party has no characters yet, so the party
 * position reads as the start point and not as a party that stands there.
 */

/**
 * The spoken noun of a place, by the tile family of the marker that links
 * to it on the map above. A town map is a region to the data model, so the
 * marker is what tells a village from a port.
 * @type {Readonly<Record<string, string>>}
 */
const PLACE_NOUNS = Object.freeze({
  city: 'a city',
  town: 'a town',
  settlement: 'a town',
  village: 'a village',
  port: 'a port',
  castle: 'a castle',
  'ruined-castle': 'a ruined castle',
  inn: 'an inn',
  tavern: 'a tavern',
  temple: 'a temple',
  shrine: 'a shrine',
  'general-store': 'a shop',
  alchemist: 'a shop',
  blacksmith: 'a smithy',
  farm: 'a farm',
  barracks: 'a barracks',
  watchtower: 'a watchtower',
  lighthouse: 'a lighthouse',
  'wizard-tower': 'a tower',
  academy: 'an academy',
  dungeon: 'a dungeon',
  'cave-entrance': 'a cave',
  mine: 'a mine',
});

/**
 * The noun that names `node` in its description: "the world map" for the
 * root, the noun of the marker art of `link` (the tile on the parent map
 * that opens the node) when the table knows it, and null otherwise. A
 * caller with null falls back to the kind of the node.
 * @param {MapNode} node
 * @param {Tile | null | undefined} link
 * @returns {string | null}
 */
export function placeNoun(node, link) {
  if (node.parentId === null) return 'the world map';
  const family = link?.imageRef.match(/^assets\/tiles\/([^/]+)\//)?.[1];
  return (family && PLACE_NOUNS[family]) ?? null;
}

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
 * The placed count and the point of interest tiles of each
 * `TileIndex.artStamp`. The stamp stands for the tile ids and point of
 * interest types at each position, and those decide both values. A fog
 * reveal keeps the stamp, so a party step reads this summary and then only
 * the candidate tiles, instead of every tile. Each candidate keeps its array
 * position, and the description reads the tile at that position in the
 * current node, because the stamp does not cover `revealed`, `discovered`,
 * or `notes`.
 * @type {WeakMap<object, { placed: number, candidates: { pos: number, x: number, y: number }[] }>}
 */
const artSummaries = new WeakMap();

/**
 * @param {MapNode} node
 */
function artSummary(node) {
  const stamp = artStamp(node);
  let summary = artSummaries.get(stamp);
  if (summary) return summary;
  // gridCellOf reads a canonical id with no regular expression and no
  // allocation. Only an id outside that form, such as "01,2" or a cell past
  // the extent, pays for parseCoords. On a 200x200 node the pass costs 0.8 ms
  // where a parseCoords call for each tile costs 2.6 ms.
  const { tiles, width, height } = node;
  let placed = 0;
  const candidates = [];
  for (let pos = 0; pos < tiles.length; pos++) {
    const tile = tiles[pos];
    const cell = gridCellOf(tile.id, width, height);
    const coords = cell >= 0 ? null : parseCoords(tile.id);
    if (cell < 0 && !coords) continue;
    placed++;
    if (!tile.metadata.poiType) continue;
    const x = coords ? coords.x : cell % width;
    candidates.push({ pos, x, y: coords ? coords.y : (cell - x) / width });
  }
  summary = { placed, candidates };
  artSummaries.set(stamp, summary);
  return summary;
}

/**
 * Build a plain-text description of a map node for screen readers and any
 * non-visual view, because the map itself is an opaque canvas. The
 * description comes in two parts. The `status` line reports the node name
 * and size, how much is explored, where the party stands, and how many
 * points of interest there are. It is short because a live region reads it
 * aloud on every change. The `points` list names each point of interest
 * with its position and notes, for an ordinary list that a screen reader
 * visits on demand. A node with many notes gives a list of more than a
 * thousand characters, which a live region would read in full on each
 * navigation. In Play mode (revealAll
 * false), the description names only the points of interest that the
 * tooltip names (see `poiNamed`). In Build mode (revealAll true), the
 * description covers everything. The GM's notes are read only when
 * `showNotes` or `revealAll` is set, because a player tab never shows them.
 * @param {MapNode} node
 * @param {PartyPosition | null} party
 * @param {DescribeOptions} [options]
 * @returns {{ status: string, points: string[] }}
 */
export function describeNode(node, party, options = {}) {
  const revealAll = options.revealAll ?? false;
  const showNotes = revealAll || (options.showNotes ?? false);
  const total = node.width * node.height;
  const { placed, candidates } = artSummary(node);
  /** @type {{ poiType: POIType, x: number, y: number, notes: string }[]} */
  const pois = [];
  for (const { pos, x, y } of candidates) {
    const tile = node.tiles[pos];
    if (!poiNamed(tile, options)) continue;
    pois.push({
      poiType: /** @type {POIType} */ (tile.metadata.poiType),
      x,
      y,
      notes: showNotes ? tile.metadata.notes : '',
    });
  }
  // A named place, such as a village or an inn, needs no environ after it.
  const named = options.placeNoun;
  const kindPhrase = named ?? (node.kind === 'interior' ? 'an interior' : 'a region');
  const environ = !named && node.environ ? ` (${node.environ})` : '';
  const parts = [`${node.name}, ${kindPhrase}${environ}, ${node.width} by ${node.height} tiles.`];

  parts.push(
    revealAll
      ? `${placed} of ${total} tiles placed.`
      : `${exploredCount(node)} of ${total} tiles explored.`,
  );

  if (party && party.nodeId === node.id) {
    const coords = parseCoords(party.tileId);
    const where = coords && `column ${toDisplay(coords.x)}, row ${toDisplay(coords.y)}`;
    if (where && options.partyEmpty) {
      parts.push(`Party start at ${where}. The party has no characters yet.`);
    } else if (where) parts.push(`Party at ${where}.`);
  }

  if (pois.length) {
    const noun = pois.length === 1 ? 'point' : 'points';
    parts.push(`${pois.length} ${noun} of interest, listed after the map.`);
  }

  const points = pois.map((poi) => {
    const notes = poi.notes ? `: ${poi.notes}` : '';
    return `${readablePoi(poi.poiType)} at column ${toDisplay(poi.x)}, row ${toDisplay(poi.y)}${notes}`;
  });
  return { status: parts.join(' '), points };
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
