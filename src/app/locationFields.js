/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/entities.js').EncounterLocation} EncounterLocation */

/**
 * Modal fields for placing something on the map: a map picker (every node,
 * labelled by its breadcrumb path, plus an unplaced option) and the tile
 * coordinates within it. Shared by the NPC dialogs and the bestiary spawn
 * dialog, so every "put this at a location" flow reads the same way.
 * @param {AppContext} app
 * @param {EncounterLocation | null} location
 * @param {{ unplacedLabel?: string }} [options] label for the null-location
 *   option — "with the party" reads better than "unplaced" for a character
 */
export function locationFields(app, location, options = {}) {
  const [x, y] = location ? location.tileId.split(',').map(Number) : [0, 0];
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
          label: app.grid.getBreadcrumb(n.id).map((b) => b.name).join(' / '),
        })),
      ],
    },
    { name: 'tileX', label: 'Tile X', type: /** @type {'number'} */ ('number'), value: x, min: 0 },
    { name: 'tileY', label: 'Tile Y', type: /** @type {'number'} */ ('number'), value: y, min: 0 },
  ];
}

/**
 * Read the placement fields back into a location, clamping the coordinates to
 * the chosen node's bounds; the unplaced option (or a deleted node) yields null.
 * @param {AppContext} app
 * @param {Record<string, string>} values
 * @returns {EncounterLocation | null}
 */
export function readLocation(app, values) {
  const node = values.nodeId ? app.grid.getNode(values.nodeId) : undefined;
  if (!node) return null;
  const clamp = (/** @type {string} */ raw, /** @type {number} */ max) =>
    Math.min(Math.max(0, Math.floor(Number(raw) || 0)), max - 1);
  return { nodeId: node.id, tileId: `${clamp(values.tileX, node.width)},${clamp(values.tileY, node.height)}` };
}
