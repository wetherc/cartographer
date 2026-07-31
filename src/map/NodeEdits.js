import { parseCoords, tileIdAt } from './MapGeometry.js';

/**
 * What a node edit does to identity, bounds, and the party's tile. Creating,
 * resizing, and regenerating a node all share these three decisions, and all
 * three used to be written out again in each of `app/nodeActions.js` and
 * `app/generateAction.js`. Pure, so the edge cases (an unparseable tile id, a
 * party standing exactly on the new edge) are testable.
 */

/**
 * A node id the grid is not already using. The generated part is short because
 * ids show up in saves and in link references, and the loop is what makes the
 * shortness safe: a collision is retried rather than assumed away.
 * @param {(id: string) => boolean} taken whether the grid already holds this id
 * @param {() => number} [rng] injected for tests; defaults to `Math.random`
 * @returns {string}
 */
export function freshNodeId(taken, rng = Math.random) {
  let id;
  do {
    id = `node-${rng().toString(36).slice(2, 8)}`;
  } while (taken(id));
  return id;
}

/**
 * Where the party ends up when the node it stands in shrinks. A tile still
 * inside the new bounds is left alone (null, meaning nothing to move), one
 * outside them is pulled back to the nearest tile that is inside, and an
 * unparseable id lands on the origin rather than on NaN.
 * @param {string} tileId
 * @param {number} width
 * @param {number} height
 * @returns {string | null} the tile to move to, or null to stay put
 */
export function tileWithinBounds(tileId, width, height) {
  const coords = parseCoords(tileId);
  if (!coords) return tileIdAt(0, 0);
  if (coords.x < width && coords.y < height) return null;
  return tileIdAt(Math.min(coords.x, width - 1), Math.min(coords.y, height - 1));
}

/**
 * Where the party ends up when the node it stands in is regenerated. A position
 * outside the new extent (or one that cannot be read at all) goes to the
 * layout's guaranteed entry tile. A position still inside it goes to whatever
 * the node's own entry rules resolve for that tile, which is how a party
 * standing on what became a wall gets moved onto the floor beside it.
 * @param {{ tileId: string, width: number, height: number, entry: string, landing: string }} opts
 *   `landing` is `EntryPoint.resolveEntryTile`'s answer for the current tile
 * @returns {string | null} the tile to move to, or null to stay put
 */
export function relandedTile({ tileId, width, height, entry, landing }) {
  const coords = parseCoords(tileId);
  const outside = !coords || coords.x >= width || coords.y >= height;
  if (outside) return entry;
  return landing === tileId ? null : landing;
}

/**
 * The marker and point-of-interest type that mark a generated map's entrance on
 * its parent. Wilderness is absent on purpose: its link rides the terrain tile
 * already there and shows as a region outline once discovered, so stamping a
 * marker over it would hide the terrain for nothing.
 * @type {Record<string, { marker: string, poi: import('../types/map.js').POIType }>}
 */
export const ENTRANCE_ART = {
  dungeon: { marker: 'dungeon', poi: 'dungeon' },
  castle: { marker: 'castle', poi: 'landmark' },
  town: { marker: 'settlement', poi: 'settlement' },
};

/**
 * The entrance art for an archetype, or null for one that takes none.
 * @param {string} archetype
 * @returns {{ marker: string, poi: import('../types/map.js').POIType } | null}
 */
export function entranceArtFor(archetype) {
  return ENTRANCE_ART[archetype] ?? null;
}
