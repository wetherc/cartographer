import { parseCoords, tileIdAt } from '../map/MapGeometry.js';
import { clampInt } from '../util/num.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/entities.js').EncounterLocation} EncounterLocation */

/**
 * Modal fields for placing something on the map: a map picker (every node,
 * labelled by its breadcrumb path, plus an unplaced option) and the tile
 * coordinates within the chosen node. The NPC dialogs and the bestiary spawn
 * dialog share this function, so every "put this at a location" flow reads
 * the same way.
 * @param {AppContext} app
 * @param {EncounterLocation | null} location
 * @param {{ unplacedLabel?: string }} [options] the label for the
 *   null-location option. For example, "with the party" reads better than
 *   "unplaced" for a character.
 */
export function locationFields(app, location, options = {}) {
  // A location whose tile id is not a grid coordinate (for example, a
  // hand-edited save) opens the dialog at the origin, not at NaN, NaN.
  const { x, y } = (location && parseCoords(location.tileId)) || { x: 0, y: 0 };
  return [
    {
      name: 'nodeId',
      label: 'Location (map)',
      type: /** @type {'select'} */ ('select'),
      value: location?.nodeId ?? '',
      options: [
        { value: '', label: options.unplacedLabel ?? 'Unplaced (appears everywhere)' },
        ...[...app.grid.nodes.values()].map((n) => ({
          value: n.id,
          label: app.grid
            .getBreadcrumb(n.id)
            .map((b) => b.name)
            .join(' / '),
        })),
      ],
    },
    { name: 'tileX', label: 'Tile X', type: /** @type {'number'} */ ('number'), value: x, min: 0 },
    { name: 'tileY', label: 'Tile Y', type: /** @type {'number'} */ ('number'), value: y, min: 0 },
  ];
}

/**
 * Read the placement fields back into a location. The function clamps the
 * coordinates to the chosen node's bounds. The unplaced option, or a
 * deleted node, yields null.
 * @param {AppContext} app
 * @param {Record<string, string>} values
 * @returns {EncounterLocation | null}
 */
export function readLocation(app, values) {
  const node = values.nodeId ? app.grid.getNode(values.nodeId) : undefined;
  if (!node) return null;
  const inBounds = (/** @type {string} */ raw, /** @type {number} */ size) =>
    clampInt(raw, 0, size - 1);
  return {
    nodeId: node.id,
    tileId: tileIdAt(inBounds(values.tileX, node.width), inBounds(values.tileY, node.height)),
  };
}
