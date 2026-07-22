/** @typedef {import('../types/map.js').MapNode} MapNode */

/**
 * A MapNode wrapped with its resolved children and depth, forming the nested
 * tree the Build-mode world tree renders. Depth is 0 at a root.
 * @typedef {object} WorldTreeNode
 * @property {MapNode} node
 * @property {WorldTreeNode[]} children
 * @property {number} depth
 */

/**
 * Derive the nested world tree from a flat list of MapNodes, linked by each
 * node's parentId. A node whose parentId is null, or points at a node not in
 * the list (an orphan), is treated as a root so nothing is ever silently
 * dropped. Cycles are broken by only visiting a node once, so a corrupt
 * parentId chain can't loop forever. Children keep the input order.
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

  // A pure parentId cycle (a->b->a) has no true root, so nothing above visits
  // it. Adopt any still-unvisited node as a root rather than silently dropping
  // it; whichever is reached first anchors, the rest hang beneath it.
  for (const n of nodes) {
    if (!visited.has(n.id)) roots.push(wrap(n, 0));
  }

  return roots;
}

/**
 * All node ids in the subtree rooted at rootId, including rootId itself. Used
 * to cascade a delete: removing a region should remove its subregions too,
 * never leaving them orphaned in the registry. Safe against cycles.
 * @param {MapNode[]} nodes
 * @param {string} rootId
 * @returns {Set<string>}
 */
export function collectSubtreeIds(nodes, rootId) {
  const childrenOf = new Map();
  for (const n of nodes) {
    if (!childrenOf.has(n.parentId)) childrenOf.set(n.parentId, []);
    childrenOf.get(n.parentId).push(n.id);
  }

  /** @type {Set<string>} */
  const ids = new Set();
  /** @type {string[]} */
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop();
    if (ids.has(id)) continue;
    ids.add(id);
    for (const childId of childrenOf.get(id) ?? []) stack.push(childId);
  }
  return ids;
}
