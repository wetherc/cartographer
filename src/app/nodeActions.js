import { createMapNode, resizeNode, tilesOutsideBounds } from '../map/TileGrid.js';
import { collectSubtreeIds } from '../map/WorldTree.js';
import { NODE_KINDS, ENVIRONS, coerceNodeKind } from '../map/NodeKinds.js';
import { freshNodeId, tileWithinBounds } from '../map/NodeEdits.js';
import { promptModal, confirmModal, alertModal } from '../ui/Modal.js';
import { capitalize } from '../util/text.js';
import { clampInt } from '../util/num.js';
import { resyncMapViews } from './mapResync.js';

/** @typedef {import('../types/map.js').MapNode} MapNode */
/** @typedef {import('../types/map.js').NodeKind} NodeKind */
/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('./mapWiring.js').MapEnv} MapEnv */

/**
 * These are the modal fields (kind and environment) shared by the new-node
 * and edit-node prompts. Environ is a single flat list of every suggested
 * tag across kinds, because the modal is static and cannot repopulate when
 * the kind select changes. So the GM can pick, for example, an interior
 * "temple" tag even while the select still shows its default value. The
 * model stores whatever string is chosen.
 * @param {NodeKind} kind
 * @param {string | null} environ
 * @returns {import('../types/modal.js').ModalField[]}
 */
function nodeKindFields(kind, environ) {
  const environs = [...ENVIRONS.region, ...ENVIRONS.interior];
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
      options: [
        { value: '', label: '(none)' },
        ...environs.map((e) => ({ value: e, label: capitalize(e) })),
      ],
    },
  ];
}

/**
 * Build the create, edit, and delete node actions over the app context and
 * the shared MapEnv. This takes the same signature as its sibling gesture
 * modules, mapAuthoring and mapTravel. It stays out of main.js because the
 * actions form a self-contained cluster: each one prompts for node details,
 * changes the grid, and resyncs the same handful of views. The returned
 * actions connect to the world tree, the region-link flow, and the
 * inspector's "create new region" control.
 * @param {AppContext} app
 * @param {MapEnv} env
 * @returns {{ addChildNode: (parentId: string) => Promise<string | null>, deleteNode: (nodeId: string) => Promise<void>, editNode: (nodeId: string) => Promise<void> }}
 */
export function createNodeActions(app, env) {
  const { grid, navigator, partyTracker } = app;

  /** @param {string} id */
  const nodeExists = (id) => Boolean(grid.getNode(id));

  /**
   * Ask for a new child MapNode's name and dimensions, add it under
   * parentId, and refresh the tree. Returns the new node id, or null if the
   * GM cancels.
   * @param {string} parentId
   * @returns {Promise<string | null>}
   */
  async function addChildNode(parentId) {
    const values = await promptModal('New node', [
      { name: 'name', label: 'Name', value: 'New region' },
      { name: 'width', label: 'Width (tiles)', type: 'number', value: 6, min: 1 },
      { name: 'height', label: 'Height (tiles)', type: 'number', value: 6, min: 1 },
      ...nodeKindFields('region', null),
    ]);
    if (!values) return null;
    const id = freshNodeId(nodeExists);
    const width = clampInt(values.width, 1);
    const height = clampInt(values.height, 1);
    const kind = coerceNodeKind(values.kind, 'region');
    grid.addNode(
      createMapNode(id, values.name || 'Untitled', parentId, width, height, {
        kind,
        environ: values.environ || null,
      }),
    );
    // This is not a resync. A new empty node changes nothing that the
    // canvas or the breadcrumb draws, only the tree it appears in.
    env.worldTree.update();
    app.actions.markDirty();
    return id;
  }

  /**
   * Ask for confirmation, then delete a node and its subtree. If the
   * removed set includes the current node, move the view to a valid node.
   * This function refuses to delete the last node.
   * @param {string} nodeId
   */
  async function deleteNode(nodeId) {
    const node = grid.getNode(nodeId);
    if (!node) return;
    const doomed = collectSubtreeIds([...grid.nodes.values()], nodeId);
    if (doomed.size >= grid.nodes.size) {
      await alertModal('Cannot delete the last node in the campaign.');
      return;
    }
    const ok = await confirmModal(`Delete "${node.name}" and everything inside it?`, {
      danger: true,
      confirmLabel: 'Delete',
    });
    if (!ok) return;

    const removed = grid.removeNode(nodeId);
    app.actions.markDirty();
    if (removed.has(navigator.currentNodeId)) {
      const fallback =
        node.parentId && grid.getNode(node.parentId) ? node.parentId : [...grid.nodes.keys()][0];
      env.goToNode(fallback);
    } else {
      // The current node survived, but a link it drew can be gone.
      resyncMapViews(app, env);
    }
  }

  /**
   * Edit a node's name and grid dimensions after creation. Growing the node
   * keeps every tile. Shrinking it asks for confirmation before removing
   * tiles outside the new bounds, and pulls the party back inside the
   * bounds if it stood on a removed tile.
   * @param {string} nodeId
   */
  async function editNode(nodeId) {
    const node = grid.getNode(nodeId);
    if (!node) return;
    const values = await promptModal(
      'Edit node',
      [
        { name: 'name', label: 'Name', value: node.name },
        { name: 'width', label: 'Width (tiles)', type: 'number', value: node.width, min: 1 },
        { name: 'height', label: 'Height (tiles)', type: 'number', value: node.height, min: 1 },
        ...nodeKindFields(node.kind, node.environ),
      ],
      { submitLabel: 'Save' },
    );
    if (!values) return;
    const width = clampInt(values.width, 1, Infinity, node.width);
    const height = clampInt(values.height, 1, Infinity, node.height);
    const lost = tilesOutsideBounds(node, width, height);
    if (lost.length) {
      const ok = await confirmModal(
        `Shrinking "${node.name}" removes ${lost.length} tile${lost.length === 1 ? '' : 's'} outside the new bounds.`,
        { danger: true, confirmLabel: 'Shrink' },
      );
      if (!ok) return;
    }
    const kind = coerceNodeKind(values.kind, node.kind);
    grid.updateNode({
      ...resizeNode(node, width, height),
      name: values.name.trim() || node.name,
      kind,
      environ: values.environ || null,
    });
    app.actions.markDirty();

    const position = partyTracker.getPosition();
    if (position.nodeId === nodeId) {
      const pulled = tileWithinBounds(position.tileId, width, height);
      if (pulled) partyTracker.moveTo(nodeId, pulled);
    }
    // Editing the node in view changes its extent or kind, so that view
    // must re-frame and re-filter the palette, and the selected tile can be
    // gone. Editing any other node still redraws the canvas, because the
    // node in view draws its children's region outlines and names.
    resyncMapViews(app, env, { reframe: navigator.getCurrentNode().id === nodeId });
  }

  return { addChildNode, deleteNode, editNode };
}
