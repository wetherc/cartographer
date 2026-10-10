import { tilesOutsideBounds } from '../map/TileGrid.js';
import { collectSubtreeIds } from '../map/WorldTreeModel.js';
import { coerceNodeKind } from '../map/NodeKinds.js';
import { MAX_MAP_EDGE, freshNodeId, mapSizeProblem } from '../map/NodeEdits.js';
import { deleteLanding, locationsAfterDelete, locationsAfterShrink } from '../map/NodeCleanup.js';
import { forgetEntries } from '../map/EntryMemory.js';
import { resolveEntryTile } from '../map/EntryPoint.js';
import { promptModal, confirmModal, alertModal } from '../ui/Modal.js';
import { deleteNodeQuestion } from '../view/DeleteNodeText.js';
import {
  deleteFallback,
  editedNode,
  editedSize,
  newChildNode,
  nodeFieldChange,
  nodeKindFields,
  shrinkQuestion,
  sizeField,
} from '../view/NodeForms.js';
import { resyncMapViews } from './mapResync.js';
import { shrinkNodeLinks, unlinkRemovedNodes } from './questCleanup.js';
import { keyItemNames, lockFields, readLockFields, unknownKeyWarning } from '../map/NodeLock.js';
import { activeEquipment } from '../library/Library.js';
import { linksIn } from '../quest/QuestLinks.js';
import { loadPersistedCampaign } from '../storage/HistoryLog.js';
import { commitCreatures } from './combatants.js';

/** @typedef {import('../types/map.js').MapNode} MapNode */
/** @typedef {import('../types/map.js').NodeKind} NodeKind */
/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('./mapWiring.js').MapEnv} MapEnv */

/**
 * Whether the stored save has a node. The header Undo steps back to that
 * save, so it can restore a deleted node only when this is true. An
 * unreadable save counts as one without the node.
 * @param {string} nodeId
 */
function inLastSave(nodeId) {
  try {
    return Boolean(loadPersistedCampaign()?.nodes.some((n) => n.id === nodeId));
  } catch {
    return false;
  }
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
  const { grid, navigator, partyTracker, state } = app;

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
    const values = await promptModal(
      'New map',
      [
        { name: 'name', label: 'Name', value: 'New region' },
        sizeField('width', 6, MAX_MAP_EDGE),
        sizeField('height', 6, MAX_MAP_EDGE),
        ...nodeKindFields('region', null),
      ],
      {
        onChange: nodeFieldChange,
        submitRequires: ['name'],
        validate: (get) => mapSizeProblem(get('width'), get('height')),
      },
    );
    if (!values) return null;
    const id = freshNodeId(nodeExists);
    grid.addNode(newChildNode(id, parentId, values));
    // This is not a resync. A new empty node changes nothing that the
    // canvas or the breadcrumb draws, only the tree it appears in and the
    // Region brush list.
    env.worldTree.update();
    env.palettePanel.regionPicker.refresh();
    app.actions.markDirty();
    return id;
  }

  /**
   * The locations a node edit can move, read from the live state.
   * @returns {import('../map/NodeCleanup.js').WorldLocations}
   */
  function currentLocations() {
    return {
      party: partyTracker.getPosition(),
      characters: state.characters,
      creatures: state.creatures,
      handouts: state.handouts,
    };
  }

  /**
   * Write moved locations back, and refresh every view that shows one. The
   * party moves through the tracker so fog reveals at the landing tile.
   * @param {import('../map/NodeCleanup.js').WorldLocations} before
   * @param {import('../map/NodeCleanup.js').WorldLocations} after
   */
  function applyLocations(before, after) {
    if (after.party !== before.party) partyTracker.moveTo(after.party.nodeId, after.party.tileId);
    state.characters = after.characters;
    state.creatures = after.creatures;
    state.handouts = after.handouts;
    // The caller marks the campaign dirty once the node is gone.
    commitCreatures(app, { dirty: false });
    app.views.handoutPanel.update();
  }

  /**
   * Ask for confirmation, then delete a node and its subtree. If the
   * removed set includes the current node, move the view to a valid node.
   * This function refuses to delete the last node. It also refuses when the
   * party stands inside the subtree and no parent node survives to land in.
   * Otherwise the party comes out beside the block the node occupied in its
   * parent, split characters inside the subtree rejoin the party, creatures
   * inside it become unplaced, handouts bound to it become campaign-wide,
   * and quest links to it are removed.
   * @param {string} nodeId
   */
  async function deleteNode(nodeId) {
    const node = grid.getNode(nodeId);
    if (!node) return;
    const doomed = collectSubtreeIds(grid.allNodes(), nodeId);
    if (doomed.size >= grid.nodeCount()) {
      await alertModal('Cannot delete the last node in the campaign.', {
        title: `Cannot delete ${node.name}`,
      });
      return;
    }
    const landing = deleteLanding(grid.allNodes(), nodeId, doomed);
    // The party can move while the dialog is open (a save adopted from
    // another tab), so the check runs before the prompt and again after it.
    const stranded = () => doomed.has(partyTracker.getPosition().nodeId) && !landing;
    if (stranded()) {
      app.toasts.show(`Cannot delete "${node.name}" while the party is inside it.`, {
        level: 'error',
      });
      return;
    }
    const question = deleteNodeQuestion({
      name: node.name,
      maps: doomed.size,
      creatures: state.creatures.filter((c) => c.location && doomed.has(c.location.nodeId)).length,
      handouts: state.handouts.filter((h) => h.nodeId && doomed.has(h.nodeId)).length,
      questLinks: linksIn(state.quests, doomed).length,
      inLastSave: inLastSave(nodeId),
    });
    const ok = await confirmModal(question, {
      title: `Delete ${node.name}?`,
      variant: 'danger',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    if (stranded()) {
      app.toasts.show(`Cannot delete "${node.name}" while the party is inside it.`, {
        level: 'error',
      });
      return;
    }

    const before = currentLocations();
    const after = locationsAfterDelete(before, doomed, landing ?? before.party);
    applyLocations(before, after);
    // A quest link to a deleted map goes too. The save-level undo brings
    // the map and the link back together.
    unlinkRemovedNodes(app, doomed);
    // The deleted nodes can never be entered again, so the memory of how
    // they were entered goes with them.
    state.entryTiles = forgetEntries(state.entryTiles, doomed);
    const removed = grid.removeNode(nodeId);
    // A stroke-undo entry for a deleted map would write to nothing or add
    // back a map whose parent is gone.
    env.pruneEdits();
    app.actions.markDirty();
    if (after.party !== before.party) {
      const parent = grid.getNode(after.party.nodeId);
      app.actions.logEvent('travel', `The party moves to ${parent?.name ?? after.party.nodeId}.`);
    }
    if (removed.has(navigator.currentNodeId)) {
      env.goToNode(deleteFallback(node, nodeExists, grid.nodeIds()));
    } else {
      // The current node survived, but a link it drew can be gone.
      resyncMapViews(app, env);
    }
  }

  /**
   * Edit a node's name and grid dimensions after creation. Growing the node
   * keeps every tile. Shrinking it asks for confirmation before removing
   * tiles outside the new bounds, and pulls the party, split characters, and
   * placed creatures back inside the bounds if they stood on a removed tile.
   * A quest link to a removed tile becomes a link to the whole node.
   * @param {string} nodeId
   */
  async function editNode(nodeId) {
    const node = grid.getNode(nodeId);
    if (!node) return;
    // Cancel on the shrink confirm returns to the form with the values the
    // GM typed, so the other edits in the form stay.
    /** @type {Record<string, string> | null} */
    let typed = null;
    /** @type {Record<string, string> | null} */
    let values = null;
    let width = node.width;
    let height = node.height;
    // A map imported over the size limit keeps its size through a rename.
    const max = {
      width: Math.max(MAX_MAP_EDGE, node.width),
      height: Math.max(MAX_MAP_EDGE, node.height),
    };
    const keyNames = keyItemNames(
      app.state.characters,
      activeEquipment().map((e) => e.name),
    );
    for (;;) {
      const lock = typed ? readLockFields(typed) : node.lock;
      values = await promptModal(
        'Map settings',
        [
          { name: 'name', label: 'Name', value: typed?.name ?? node.name },
          sizeField('width', typed?.width ?? node.width, max.width),
          sizeField('height', typed?.height ?? node.height, max.height),
          ...nodeKindFields(
            coerceNodeKind(typed?.kind, node.kind),
            typed ? typed.environ || null : node.environ,
          ),
          ...lockFields(lock ?? undefined, keyNames),
        ],
        {
          submitLabel: 'Save',
          onChange: nodeFieldChange,
          submitRequires: ['name'],
          validate: (get) => mapSizeProblem(get('width'), get('height'), max),
        },
      );
      if (!values) return;
      ({ width, height } = editedSize(node, values));
      const lost = tilesOutsideBounds(node, width, height);
      if (
        !lost.length ||
        (await confirmModal(shrinkQuestion(node.name, lost.length), {
          title: `Shrink ${node.name}?`,
          variant: 'danger',
          confirmLabel: 'Shrink',
        }))
      ) {
        break;
      }
      typed = values;
    }
    grid.updateNode(editedNode(node, values));
    const lock = readLockFields(values);
    app.actions.markDirty();
    const keyWarning = unknownKeyWarning(lock, keyNames);
    if (keyWarning) app.toasts.show(keyWarning);

    const before = currentLocations();
    const resized = grid.getNode(nodeId);
    const landingFor = resized
      ? (/** @type {string} */ id) => resolveEntryTile(resized, id)
      : undefined;
    applyLocations(before, locationsAfterShrink(before, nodeId, width, height, landingFor));
    shrinkNodeLinks(app, nodeId, width, height);
    // Editing the node in view changes its extent or kind, so that view
    // must re-frame and re-filter the palette, and the selected tile can be
    // gone. Editing any other node still redraws the canvas, because the
    // node in view draws its children's region outlines and names.
    resyncMapViews(app, env, { reframe: navigator.getCurrentNode().id === nodeId });
  }

  return { addChildNode, deleteNode, editNode };
}
