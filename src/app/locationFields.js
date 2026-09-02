import { displayCoords, tileIdFromDisplay } from '../map/TileCoords.js';
import { clampInt } from '../util/num.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/entities.js').EncounterLocation} EncounterLocation */

/**
 * Modal fields for placing something on the map: a map picker (every node,
 * labelled by its breadcrumb path, plus an unplaced option) and the column
 * and row within the chosen node. The creature dialog and the bestiary
 * spawn dialog share this function, so every "put this at a location" flow
 * reads the same way.
 *
 * The column and row count from 1, the same as the numbers along the map
 * edge and the screen-reader description. The stored tile id counts from 0.
 * `readLocation` converts back, so a GM can copy a position straight from
 * the map into the dialog.
 * @param {AppContext} app
 * @param {EncounterLocation | null} location
 * @param {{ unplacedLabel?: string }} [options] the label for the
 *   null-location option. For example, "with the party" reads better than
 *   "unplaced" for a character.
 */
export function locationFields(app, location, options = {}) {
  // A location whose tile id is not a grid coordinate (for example, a
  // hand-edited save) opens the dialog at the top-left tile, not at NaN, NaN.
  const { column, row } = (location && displayCoords(location.tileId)) || { column: 1, row: 1 };
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
    {
      name: 'tileX',
      label: 'Column',
      type: /** @type {'number'} */ ('number'),
      value: column,
      min: 1,
    },
    { name: 'tileY', label: 'Row', type: /** @type {'number'} */ ('number'), value: row, min: 1 },
  ];
}

/**
 * Read the placement fields back into a location. The typed column and row
 * count from 1, and the function clamps them to the chosen node's bounds
 * before it converts to the stored tile id. The unplaced option, or a
 * deleted node, yields null.
 * @param {AppContext} app
 * @param {Record<string, string>} values
 * @returns {EncounterLocation | null}
 */
export function readLocation(app, values) {
  const node = values.nodeId ? app.grid.getNode(values.nodeId) : undefined;
  if (!node) return null;
  const inBounds = (/** @type {string} */ raw, /** @type {number} */ size) =>
    clampInt(raw, 1, size);
  return {
    nodeId: node.id,
    tileId: tileIdFromDisplay(
      inBounds(values.tileX, node.width),
      inBounds(values.tileY, node.height),
    ),
  };
}
