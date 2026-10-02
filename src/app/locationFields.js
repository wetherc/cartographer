import { displayCoords, tileIdFromDisplay } from '../map/TileCoords.js';
import { clampInt } from '../util/num.js';
import { getTile } from '../map/TileGrid.js';
import { isBlocked, isDeepWater } from '../map/TileKinds.js';
import { canPickOnMap, pickMapTile } from './mapPick.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/entities.js').EncounterLocation} EncounterLocation */
/** @typedef {import('../types/map.js').MapNode} MapNode */
/** @typedef {import('../types/modal.js').FieldOption} FieldOption */
/** @typedef {import('../types/modal.js').ModalFormHandle} ModalFormHandle */

/**
 * The map choices of the location picker. A campaign can have more than a
 * hundred maps, and one flat list of breadcrumb paths is hard to scan. Each
 * map is listed by its own name, under an optgroup that names its parent by
 * the parent's full path. The walk is depth first, so a parent's group
 * comes before the groups of its children. The top-level maps come first,
 * with no group.
 * @param {MapNode[]} nodes in the grid's order
 * @param {(id: string) => string} pathOf the breadcrumb path of a node, for
 *   example "The Marches / Briarwick Vale"
 * @returns {FieldOption[]}
 */
export function locationOptions(nodes, pathOf) {
  const ids = new Set(nodes.map((n) => n.id));
  /** @type {Map<string | null, MapNode[]>} */
  const children = new Map();
  for (const node of nodes) {
    const parent = node.parentId && ids.has(node.parentId) ? node.parentId : null;
    children.set(parent, [...(children.get(parent) ?? []), node]);
  }
  /** @type {FieldOption[]} */
  const options = (children.get(null) ?? []).map((n) => ({ value: n.id, label: n.name }));
  /** @param {MapNode} parent */
  const walk = (parent) => {
    const kids = children.get(parent.id) ?? [];
    const group = pathOf(parent.id);
    for (const kid of kids) options.push({ value: kid.id, label: kid.name, group });
    for (const kid of kids) walk(kid);
  };
  for (const root of children.get(null) ?? []) walk(root);
  return options;
}

/**
 * The options of the map picker: the unplaced option, then every node of
 * the grid as `locationOptions` lists it.
 * @param {AppContext} app
 * @param {string} [unplacedLabel]
 * @returns {FieldOption[]}
 */
function mapChoices(app, unplacedLabel = 'Unplaced (appears everywhere)') {
  return [
    { value: '', label: unplacedLabel },
    ...locationOptions([...app.grid.nodes.values()], (id) =>
      app.grid
        .getBreadcrumb(id)
        .map((b) => b.name)
        .join(' / '),
    ),
  ];
}

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
 * @param {{ unplacedLabel?: string, partyButton?: boolean, pickButton?: boolean, warn?: boolean }} [options]
 *   `unplacedLabel` is the label for the null-location option. For example,
 *   "with the party" reads better than "unplaced" for a character.
 *   `partyButton` adds a "Move to the party" button, which
 *   `moveToPartyChange` handles.
 *   `pickButton` adds a "Pick on map" button, which `pickOnMapChange`
 *   handles. The button shows only in a mode that shows the map (see
 *   `canPickOnMap`).
 *   `warn` adds a live line under the row that names a doubtful tile (see
 *   `placementWarning`), which `placementChange` keeps current.
 */
export function locationFields(app, location, options = {}) {
  // A location whose tile id is not a grid coordinate (for example, a
  // hand-edited save) opens the dialog at the top-left tile, not at NaN, NaN.
  const { column, row } = (location && displayCoords(location.tileId)) || { column: 1, row: 1 };
  const warning = options.warn
    ? placementWarning(location ? app.grid.getNode(location.nodeId) : undefined, column, row)
    : '';
  return [
    {
      name: 'nodeId',
      label: 'Location (map)',
      type: /** @type {'select'} */ ('select'),
      value: location?.nodeId ?? '',
      options: mapChoices(app, options.unplacedLabel),
    },
    {
      name: 'tileX',
      label: 'Column',
      type: /** @type {'number'} */ ('number'),
      value: column,
      min: 1,
    },
    { name: 'tileY', label: 'Row', type: /** @type {'number'} */ ('number'), value: row, min: 1 },
    ...(options.warn
      ? [
          {
            name: 'placementNote',
            label: warning,
            hidden: !warning,
            type: /** @type {'note'} */ ('note'),
            full: true,
          },
        ]
      : []),
    ...(options.pickButton && canPickOnMap(app.state.mode)
      ? [{ name: 'pickOnMap', label: 'Pick on map', type: /** @type {'button'} */ ('button') }]
      : []),
    ...(options.partyButton
      ? [{ name: 'toParty', label: 'Move to the party', type: /** @type {'button'} */ ('button') }]
      : []),
  ];
}

/**
 * The `onChange` part of the "Move to the party" button: it writes the
 * party's map, column, and row into the placement fields. It answers true
 * when it handled the change, so a caller's own handler can skip it.
 * @param {AppContext} app
 * @returns {(name: string, form: ModalFormHandle) => boolean}
 */
export function moveToPartyChange(app) {
  return (name, form) => {
    if (name !== 'toParty') return false;
    setPlacement(form, app.partyTracker.getPosition());
    return true;
  };
}

/**
 * Write a location into the map, column, and row fields.
 * @param {ModalFormHandle} form
 * @param {EncounterLocation} location
 */
function setPlacement(form, { nodeId, tileId }) {
  const { column, row } = displayCoords(tileId) ?? { column: 1, row: 1 };
  form.set('nodeId', nodeId);
  form.set('tileX', column);
  form.set('tileY', row);
}

/**
 * The `onChange` part of the "Pick on map" button. The dialog closes while
 * the map waits for one click, and then it opens again with every value
 * kept. A pick writes the map in view and the clicked column and row into
 * the placement fields and updates the warning line. A cancel leaves the
 * fields as they were. It answers true when it handled the change.
 *
 * The GM can add a map while the dialog waits and then click a tile of it.
 * The map choices are built again before the pick goes in, so the picker
 * offers that map and does not fall back to the unplaced option.
 * @param {AppContext} app
 * @param {(app: AppContext) => Promise<EncounterLocation | null>} [pick]
 *   the map wait, replaced in tests
 * @returns {(name: string, form: ModalFormHandle) => boolean}
 */
export function pickOnMapChange(app, pick = pickMapTile) {
  const warn = placementChange(app);
  return (name, form) => {
    if (name !== 'pickOnMap') return false;
    form.suspend?.(name, async () => {
      const at = await pick(app);
      if (!at) return;
      form.setOptions('nodeId', mapChoices(app));
      setPlacement(form, at);
      warn('nodeId', form);
    });
    return true;
  };
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

/**
 * The tile a new creature lands on when the GM gives none: the selected
 * tile, or else the middle tile of the map. The corner tile (column 1,
 * row 1) is often open sea or rock on a generated map.
 * @param {Pick<MapNode, 'width' | 'height'>} node
 * @param {string | null} selected the selected tile id, if any
 * @returns {string}
 */
export function defaultTileId(node, selected) {
  if (selected) return selected;
  const half = (/** @type {number} */ size) => Math.max(0, Math.floor((size - 1) / 2));
  return `${half(node.width)},${half(node.height)}`;
}

/**
 * The placement preset of a new creature on the map in view, at
 * `defaultTileId`.
 * @param {AppContext} app
 * @returns {EncounterLocation}
 */
export function viewedPlacement(app) {
  const node = app.navigator.getCurrentNode();
  return { nodeId: node.id, tileId: defaultTileId(node, app.actions.getSelectedTileId()) };
}

/**
 * A warning for a placement that is likely a slip: a tile outside the map,
 * a cell with no tile, deep water, or a wall or obstacle. A sea creature or a
 * foe in a wall niche is still allowed, so the dialog warns and does not
 * refuse. An empty string means the tile looks fine, or no map is chosen.
 * @param {MapNode | undefined} node
 * @param {string | number} column counted from 1
 * @param {string | number} row counted from 1
 * @returns {string}
 */
export function placementWarning(node, column, row) {
  if (!node) return '';
  const [x, y] = [Number(column), Number(row)];
  if (!(x >= 1 && x <= node.width && y >= 1 && y <= node.height))
    return `That tile is outside this map, which is ${node.width} by ${node.height} tiles. The creature goes to the nearest tile inside it.`;
  // `readLocation` rounds a fraction such as 3.5 down, so the warning names
  // the tile that the save uses.
  const tile = getTile(
    node,
    tileIdFromDisplay(clampInt(x, 1, node.width), clampInt(y, 1, node.height)),
  );
  if (!tile) return 'That tile has no terrain.';
  if (isDeepWater(tile)) return 'That tile is deep water.';
  if (isBlocked(tile)) return 'That tile is a wall or an obstacle.';
  return '';
}

/**
 * The `onChange` part of the placement warning. It rewrites the warning line
 * after an edit of the map, column, or row, and hides the line when it is
 * empty. It answers false, so a caller's other handlers still run.
 * @param {AppContext} app
 * @returns {(name: string, form: ModalFormHandle) => boolean}
 */
export function placementChange(app) {
  return (name, form) => {
    if (!['nodeId', 'tileX', 'tileY', 'toParty'].includes(name)) return false;
    const nodeId = form.get('nodeId');
    const text = placementWarning(
      nodeId ? app.grid.getNode(nodeId) : undefined,
      form.get('tileX'),
      form.get('tileY'),
    );
    form.setLabel('placementNote', text);
    form.setHidden('placementNote', !text);
    return false;
  };
}
