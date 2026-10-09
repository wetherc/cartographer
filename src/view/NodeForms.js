import { createMapNode, resizeNode } from '../map/TileGrid.js';
import { NODE_KINDS, coerceNodeKind, environFieldOptions } from '../map/NodeKinds.js';
import { readLockFields } from '../map/NodeLock.js';
import { capitalize } from '../util/text.js';
import { clampInt } from '../util/num.js';

/** @typedef {import('../types/map.js').MapNode} MapNode */
/** @typedef {import('../types/map.js').NodeKind} NodeKind */
/** @typedef {import('../types/modal.js').ModalField} ModalField */

/**
 * The fields and the form reads of the New map and Map settings dialogs.
 * `app/nodeActions.js` opens the dialogs and writes the result to the grid.
 */

/**
 * These are the modal fields (kind and environment) shared by the new-node
 * and edit-node prompts. Environment lists the tags of the chosen kind, and
 * `nodeFieldChange` refills it when Kind changes, so a region never offers
 * "Inn". The model stores whatever string is chosen.
 * @param {NodeKind} kind
 * @param {string | null} environ
 * @returns {ModalField[]}
 */
export function nodeKindFields(kind, environ) {
  return [
    {
      name: 'kind',
      label: 'Kind',
      type: 'select',
      value: kind,
      options: NODE_KINDS.map((k) => ({ value: k, label: capitalize(k) })),
    },
    {
      name: 'environ',
      label: 'Environment',
      type: 'select',
      value: environ ?? '',
      options: environFieldOptions(kind, environ),
    },
  ];
}

/**
 * The onChange of the node dialogs. A Kind change refills Environment with
 * the tags of the new kind.
 * @param {string} name
 * @param {import('../types/modal.js').ModalFormHandle} form
 */
export function nodeFieldChange(name, form) {
  if (name === 'kind') {
    form.setOptions('environ', environFieldOptions(form.get('kind'), null));
  }
}

/**
 * A map width or height field of the New map and Map settings dialogs. The
 * caption states the range. The field sets no `min` or `max`, because the
 * number field moves a value outside those bounds into range when it loses
 * focus, and a click on Create would then accept 64 for a typed 3000 with no
 * message. `mapSizeProblem` refuses the value instead and names the field.
 * @param {'width' | 'height'} name
 * @param {string | number} value
 * @param {number} max
 * @returns {ModalField}
 */
export function sizeField(name, value, max) {
  const label = `${capitalize(name)} (tiles, 1 to ${max})`;
  return { name, label, type: 'number', value };
}

/**
 * The node that the New map dialog creates. A blank name reads "Untitled",
 * and an unknown kind reads as a region.
 * @param {string} id
 * @param {string} parentId
 * @param {Record<string, string>} values the dialog's answers
 * @returns {MapNode}
 */
export function newChildNode(id, parentId, values) {
  return createMapNode(
    id,
    values.name.trim() || 'Untitled',
    parentId,
    clampInt(values.width, 1),
    clampInt(values.height, 1),
    { kind: coerceNodeKind(values.kind, 'region'), environ: values.environ || null },
  );
}

/**
 * The width and height that the Map settings dialog asks for. A field that
 * does not read as a number keeps the node's current size.
 * @param {MapNode} node
 * @param {Record<string, string>} values
 * @returns {{ width: number, height: number }}
 */
export function editedSize(node, values) {
  return {
    width: clampInt(values.width, 1, Infinity, node.width),
    height: clampInt(values.height, 1, Infinity, node.height),
  };
}

/**
 * The node after a Map settings save. It takes the new size, kind,
 * environment, and lock. A blank name keeps the old name, and an unlocked
 * map drops its lock field.
 * @param {MapNode} node
 * @param {Record<string, string>} values
 * @returns {MapNode}
 */
export function editedNode(node, values) {
  const { width, height } = editedSize(node, values);
  const lock = readLockFields(values);
  const { lock: _old, ...resized } = resizeNode(node, width, height);
  return {
    ...resized,
    ...(lock ? { lock } : {}),
    name: values.name.trim() || node.name,
    kind: coerceNodeKind(values.kind, node.kind),
    environ: values.environ || null,
  };
}

/**
 * The confirm text before a Map settings save removes tiles.
 * @param {string} name
 * @param {number} lost the number of tiles outside the new bounds
 * @returns {string}
 */
export function shrinkQuestion(name, lost) {
  return `Shrinking "${name}" removes ${lost} tile${lost === 1 ? '' : 's'} outside the new bounds.`;
}

/**
 * The node to show after a delete removes the node in view: the deleted
 * node's parent when it is still there, else the first node left.
 * @param {MapNode} deleted
 * @param {(id: string) => boolean} exists
 * @param {string[]} remaining the ids of the nodes left after the delete
 * @returns {string}
 */
export function deleteFallback(deleted, exists, remaining) {
  return deleted.parentId && exists(deleted.parentId) ? deleted.parentId : remaining[0];
}
