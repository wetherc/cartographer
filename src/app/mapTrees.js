import { discoveredNodes } from '../map/FogOfWar.js';
import { authoringWarning } from '../map/MapExits.js';
import { lockBadge } from '../map/NodeLock.js';
import { mustGetElement } from '../ui/dom.js';
import { mountBreadcrumb } from '../ui/Breadcrumb.js';
import { mountWorldTree } from '../ui/WorldTree.js';
import { isGM } from '../view/ViewRole.js';
import { deferMount } from '../util/deferMount.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/mapEnv.js').MapEnv} MapEnv */

/**
 * Mount the views that list the map hierarchy: the breadcrumb, the Build-rail
 * world tree, and the Play-mode region tree. Each view is stored on env as it
 * mounts. Call this after env.nodeActions is set.
 * @param {AppContext} app
 * @param {MapEnv} env
 * @param {(nodeId: string) => void} teleportToNode the region tree's select action
 */
export function mountMapTrees(app, env, teleportToNode) {
  const { grid, navigator, partyTracker, state } = app;
  const { goToNode, nodeActions } = env;

  env.breadcrumb = mountBreadcrumb(mustGetElement('breadcrumb-container'), goToNode);

  // A Player tab gets an empty Build-rail tree. The rail is hidden in that
  // role, but a filled tree would still put the name of every node, such as
  // an undiscovered dungeon, into the page for anyone who reads the DOM.
  // The tree mounts on the first switch to Build mode (showBuild in
  // mapModes.js).
  env.worldTree = deferMount(() =>
    mountWorldTree(mustGetElement('world-tree-container'), {
      getNodes: () => (isGM(state.role) ? grid.allNodes() : []),
      getCurrentId: () => navigator.getCurrentNode().id,
      onSelect: goToNode,
      // The new map opens at once, and the tree opens the rows above it and
      // selects its row, so the GM sees where it went.
      onAddChild: async (id) => {
        const child = await nodeActions.addChildNode(id);
        if (child) goToNode(child);
      },
      onEdit: (id) => nodeActions.editNode(id),
      onDelete: (id) => nodeActions.deleteNode(id),
      // Badge every unreachable or sealed node. Unlinking a tile flags the
      // orphaned child node here, instead of only when the GM next views it.
      // This check runs in Build mode only: the tree sits in a Build-only rail.
      // Adding the check to the signature costs a world scan on every
      // Play-mode party step.
      getWarning: (node) =>
        state.mode === 'build' ? authoringWarning(node, grid.getParent(node)) : null,
      getLock: lockBadge,
    }),
  );

  // The Play-mode counterpart to the Build-mode world tree. It shows the same
  // hierarchy, but read-only, with no add or delete controls. A player sees
  // only the nodes that the party has discovered, so unexplored regions stay
  // hidden from the table. The GM always sees the whole world. Selecting a
  // node offers to teleport the party there.
  const regionTree = mountWorldTree(mustGetElement('region-tree-container'), {
    getNodes: () =>
      isGM(state.role)
        ? grid.allNodes()
        : discoveredNodes(grid.allNodes(), partyTracker.getPosition()),
    getCurrentId: () => navigator.getCurrentNode().id,
    onSelect: teleportToNode,
  });
  app.views.regionTree = regionTree;
  env.regionTree = regionTree;
}
