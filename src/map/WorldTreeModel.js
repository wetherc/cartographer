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
 * loop forever. Children keep the input order. The children of each node
 * come from one index built up front, so the cost grows with the node count
 * and not with its square.
 * @param {MapNode[]} nodes
 * @returns {WorldTreeNode[]} roots, each with children/depth populated
 */
export function buildWorldTree(nodes) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const childrenOf = childIndex(nodes);

  /** @type {Set<string>} */
  const visited = new Set();

  /**
   * @param {MapNode} node
   * @param {number} depth
   * @returns {WorldTreeNode}
   */
  function wrap(node, depth) {
    visited.add(node.id);
    /** @type {WorldTreeNode[]} */
    const children = [];
    for (const child of childrenOf.get(node.id) ?? []) {
      if (!visited.has(child.id)) children.push(wrap(child, depth + 1));
    }
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
 * The nodes of the list grouped by parentId, each group in input order.
 * @param {MapNode[]} nodes
 * @returns {Map<string | null, MapNode[]>}
 */
function childIndex(nodes) {
  /** @type {Map<string | null, MapNode[]>} */
  const childrenOf = new Map();
  for (const n of nodes) {
    const siblings = childrenOf.get(n.parentId);
    if (siblings) siblings.push(n);
    else childrenOf.set(n.parentId, [n]);
  }
  return childrenOf;
}

/**
 * The ids of every node above nodeId, nearest parent first. The walk stops at
 * a missing parent or at a node it has already seen, so a corrupt parentId
 * cycle cannot loop. The world tree opens these rows, so the row of the
 * current node is never inside a collapsed branch.
 * @param {MapNode[]} nodes
 * @param {string} nodeId
 * @returns {string[]}
 */
export function ancestorIds(nodes, nodeId) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  /** @type {string[]} */
  const ids = [];
  const seen = new Set([nodeId]);
  let parentId = byId.get(nodeId)?.parentId ?? null;
  while (parentId !== null && byId.has(parentId) && !seen.has(parentId)) {
    ids.push(parentId);
    seen.add(parentId);
    parentId = byId.get(parentId)?.parentId ?? null;
  }
  return ids;
}

/**
 * Keep the part of the tree that matches a search. A node stays if its name
 * contains the query, ignoring case and surrounding spaces, or if one of its
 * descendants stays. A match keeps its own children only when they match too,
 * so each result shows the path that leads to it and nothing else. An empty
 * query returns the tree unchanged.
 * @param {WorldTreeNode[]} roots
 * @param {string} query
 * @returns {WorldTreeNode[]}
 */
export function filterWorldTree(roots, query) {
  if (!query.trim()) return roots;

  /** @param {WorldTreeNode} treeNode @returns {WorldTreeNode | null} */
  function prune(treeNode) {
    const children = treeNode.children.map(prune).filter((c) => c !== null);
    const matches = matchesQuery(treeNode.node, query);
    return matches || children.length ? { ...treeNode, children } : null;
  }

  return roots.map(prune).filter((r) => r !== null);
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
  const childrenOf = childIndex(nodes);

  /** @type {Set<string>} */
  const ids = new Set();
  /** @type {string[]} */
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop();
    if (id === undefined || ids.has(id)) continue;
    ids.add(id);
    for (const child of childrenOf.get(id) ?? []) stack.push(child.id);
  }
  return ids;
}

/**
 * True when the name of the node contains the query, ignoring case and
 * surrounding spaces. An empty query matches nothing.
 * @param {MapNode} node
 * @param {string} query
 * @returns {boolean}
 */
export function matchesQuery(node, query) {
  const needle = query.trim().toLowerCase();
  return needle !== '' && node.name.toLowerCase().includes(needle);
}
