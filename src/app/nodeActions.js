import { createMapNode, resizeNode, tilesOutsideBounds } from '../map/TileGrid.js';
import { collectSubtreeIds } from '../map/WorldTree.js';
import { NODE_KINDS, ENVIRONS } from '../map/NodeKinds.js';
import { parseCoords } from '../map/MapGeometry.js';
import { promptModal, confirmModal } from '../ui/Modal.js';

/** @typedef {import('../types/map.js').MapNode} MapNode */
/** @typedef {import('../types/map.js').NodeKind} NodeKind */

/**
 * Runtime dependencies the node actions operate over. Views and callbacks are
 * read at call time (not when the actions are created), so the app can create
 * the actions before every view/callback exists and fill this context in as it
 * wires the rest of the module up.
 * @typedef {Object} NodeActionsContext
 * @property {import('../map/TileGrid.js').TileGrid} grid
 * @property {import('../map/MapNavigator.js').MapNavigator} navigator
 * @property {import('../party/PartyTracker.js').PartyTracker} partyTracker
 * @property {{ setNode: (node: MapNode) => void, refreshNode: (node: MapNode) => void }} mapCanvas
 * @property {{ update: (crumb: unknown) => void }} breadcrumb
 * @property {{ update: () => void }} worldTree
 * @property {{ update: () => void }} regionTree
 * @property {(nodeId: string) => void} goToNode
 * @property {() => void} clearSelection
 * @property {() => void} syncPaletteKind
 * @property {() => void} syncPartyMarker
 */

/**
 * Modal fields (kind + environment) shared by the new-node and edit-node
 * prompts. Environ is a single flat list of every suggested tag across kinds
 * (the modal is static and can't repopulate when the kind select changes), so
 * a GM can pick, say, an interior "temple" tag even while the select still says
 * whatever it defaulted to; the model stores whatever string is chosen.
 * @param {NodeKind} kind
 * @param {string | null} environ
 * @returns {import('../ui/Modal.js').ModalField[]}
 */
function nodeKindFields(kind, environ) {
  const environs = [...ENVIRONS.region, ...ENVIRONS.interior];
  return [
    {
      name: 'kind',
      label: 'Kind',
      type: 'select',
      value: kind,
      options: NODE_KINDS.map((k) => ({ value: k, label: k[0].toUpperCase() + k.slice(1) })),
    },
    {
      name: 'environ',
      label: 'Environment',
      type: 'select',
      value: environ ?? '',
      options: [
        { value: '', label: '(none)' },
        ...environs.map((e) => ({ value: e, label: e[0].toUpperCase() + e.slice(1) })),
      ],
    },
  ];
}

/**
 * Build the create/edit/delete-node actions bound to a shared context. Kept
 * out of main.js because they form a self-contained cluster: each prompts for
 * node details, mutates the grid, and resyncs the same handful of views. The
 * returned actions are wired into the world tree, the region-link flow, and the
 * inspector's "create new region" affordance.
 * @param {NodeActionsContext} ctx
 * @returns {{ addChildNode: (parentId: string) => Promise<string | null>, deleteNode: (nodeId: string) => Promise<void>, editNode: (nodeId: string) => Promise<void> }}
 */
export function createNodeActions(ctx) {
  /** Generate a node id not already used by the grid. */
  function freshNodeId() {
    let id;
    do {
      id = `node-${Math.random().toString(36).slice(2, 8)}`;
    } while (ctx.grid.getNode(id));
    return id;
  }

  /**
   * Prompt for a new child MapNode's name and dimensions, add it under parentId,
   * and refresh the tree. Returns the new node id, or null if cancelled.
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
    const id = freshNodeId();
    const width = Math.max(1, Number(values.width) || 1);
    const height = Math.max(1, Number(values.height) || 1);
    const kind = /** @type {NodeKind} */ (
      NODE_KINDS.includes(values.kind) ? values.kind : 'region'
    );
    ctx.grid.addNode(
      createMapNode(id, values.name || 'Untitled', parentId, width, height, {
        kind,
        environ: values.environ || null,
      }),
    );
    ctx.worldTree.update();
    return id;
  }

  /**
   * Confirm and delete a node and its subtree, then move the view somewhere
   * valid if the current node was removed. Refuses to delete the last node.
   * @param {string} nodeId
   */
  async function deleteNode(nodeId) {
    const node = ctx.grid.getNode(nodeId);
    if (!node) return;
    const doomed = collectSubtreeIds([...ctx.grid.nodes.values()], nodeId);
    if (doomed.size >= ctx.grid.nodes.size) {
      await confirmModal('Cannot delete the last node in the campaign.', { confirmLabel: 'OK' });
      return;
    }
    const ok = await confirmModal(`Delete "${node.name}" and everything inside it?`, {
      danger: true,
      confirmLabel: 'Delete',
    });
    if (!ok) return;

    const removed = ctx.grid.removeNode(nodeId);
    if (removed.has(ctx.navigator.currentNodeId)) {
      const fallback =
        node.parentId && ctx.grid.getNode(node.parentId)
          ? node.parentId
          : [...ctx.grid.nodes.keys()][0];
      ctx.goToNode(fallback);
    } else {
      // Current node survived, but a link it drew may have been cleared.
      ctx.mapCanvas.refreshNode(ctx.navigator.getCurrentNode());
      ctx.worldTree.update();
      ctx.regionTree.update();
    }
  }

  /**
   * Edit a node's name and grid dimensions after creation. Growing keeps every
   * tile; shrinking prompts before pruning tiles outside the new bounds, and
   * pulls the party back inside them if it stood on a pruned tile.
   * @param {string} nodeId
   */
  async function editNode(nodeId) {
    const node = ctx.grid.getNode(nodeId);
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
    const width = Math.max(1, Number(values.width) || node.width);
    const height = Math.max(1, Number(values.height) || node.height);
    const lost = tilesOutsideBounds(node, width, height);
    if (lost.length) {
      const ok = await confirmModal(
        `Shrinking "${node.name}" removes ${lost.length} tile${lost.length === 1 ? '' : 's'} outside the new bounds.`,
        { danger: true, confirmLabel: 'Shrink' },
      );
      if (!ok) return;
    }
    const kind = /** @type {NodeKind} */ (
      NODE_KINDS.includes(values.kind) ? values.kind : node.kind
    );
    ctx.grid.updateNode({
      ...resizeNode(node, width, height),
      name: values.name.trim() || node.name,
      kind,
      environ: values.environ || null,
    });

    const position = ctx.partyTracker.getPosition();
    if (position.nodeId === nodeId) {
      const coords = parseCoords(position.tileId);
      if (coords && (coords.x >= width || coords.y >= height)) {
        ctx.partyTracker.moveTo(
          nodeId,
          `${Math.min(coords.x, width - 1)},${Math.min(coords.y, height - 1)}`,
        );
      }
    }
    if (ctx.navigator.getCurrentNode().id === nodeId) {
      // The extent or kind changed, so re-frame the view and re-filter the
      // palette; the selected tile may be gone.
      ctx.clearSelection();
      ctx.mapCanvas.setNode(ctx.navigator.getCurrentNode());
      ctx.syncPartyMarker();
      ctx.syncPaletteKind();
    }
    ctx.breadcrumb.update(ctx.navigator.getBreadcrumb());
    ctx.worldTree.update();
    ctx.regionTree.update();
  }

  return { addChildNode, deleteNode, editNode };
}
