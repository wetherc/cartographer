/** @typedef {import('../types/map.js').MapNode} MapNode */

/**
 * A MapNode wrapped with its resolved children and depth. This forms the
 * nested tree that the Build-mode world tree renders. Depth is 0 at a root.
 * @typedef {object} WorldTreeNode
 * @property {MapNode} node
 * @property {WorldTreeNode[]} children
 * @property {number} depth
 */

/**
 * Derive the nested world tree from a flat list of MapNodes, linked by each
 * node's parentId. The function treats a node as a root if its parentId is
 * null, or if the parentId points at a node not in the list (an orphan). This
 * makes sure that no node is dropped without notice. The function breaks
 * cycles by visiting each node only once, so a corrupt parentId chain cannot
 * loop forever. Children keep the input order.
 * @param {MapNode[]} nodes
 * @returns {WorldTreeNode[]} roots, each with children/depth populated
 */
export function buildWorldTree(nodes) {
  const byId = new Map(nodes.map((n) => [n.id, n]));

  /** @type {Set<string>} */
  const visited = new Set();

  /**
   * @param {MapNode} node
   * @param {number} depth
   * @returns {WorldTreeNode}
   */
  function wrap(node, depth) {
    visited.add(node.id);
    const children = nodes
      .filter((n) => n.parentId === node.id && !visited.has(n.id))
      .map((child) => wrap(child, depth + 1));
    return { node, children, depth };
  }

  const roots = nodes
    .filter((n) => n.parentId === null || !byId.has(n.parentId))
    .filter((n) => !visited.has(n.id))
    .map((root) => wrap(root, 0));

  // A pure parentId cycle (a->b->a) has no true root, so the code above does
  // not visit it. Adopt any still-unvisited node as a root, instead of
  // dropping it. The first node reached anchors the cycle, and the rest hang
  // beneath it.
  for (const n of nodes) {
    if (!visited.has(n.id)) roots.push(wrap(n, 0));
  }

  return roots;
}

/**
 * All node ids in the subtree rooted at rootId, including rootId itself. The
 * app uses this to cascade a delete: removing a region must also remove its
 * subregions, and never leave them orphaned in the registry. Safe against
 * cycles.
 * @param {MapNode[]} nodes
 * @param {string} rootId
 * @returns {Set<string>}
 */
export function collectSubtreeIds(nodes, rootId) {
  /** @type {Map<string | null, string[]>} */
  const childrenOf = new Map();
  for (const n of nodes) {
    const siblings = childrenOf.get(n.parentId) ?? [];
    if (siblings.length === 0) childrenOf.set(n.parentId, siblings);
    siblings.push(n.id);
  }

  /** @type {Set<string>} */
  const ids = new Set();
  /** @type {string[]} */
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop();
    if (id === undefined || ids.has(id)) continue;
    ids.add(id);
    for (const childId of childrenOf.get(id) ?? []) stack.push(childId);
  }
  return ids;
}
