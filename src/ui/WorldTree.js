import { icon } from './icons.js';
import { iconButton } from './buttons.js';
import { el } from './dom.js';
import { buildWorldTree } from '../map/WorldTree.js';

/** @typedef {import('../types/map.js').MapNode} MapNode */
/** @typedef {import('../map/WorldTree.js').WorldTreeNode} WorldTreeNode */

/**
 * Mount the world tree: a nested list mirroring the MapNode hierarchy, always
 * showing the whole tree rather than only the path to the current node. It is
 * the Build-mode counterpart to the Play-mode breadcrumb, over the same
 * TileGrid data. Selecting a node invokes onSelect; if onAddChild/onEdit/
 * onDelete are supplied, each row also gets an add-child, edit-settings, and
 * delete affordance (used in Build mode). With `collapsible`, every row with
 * children gets an expand/collapse chevron; collapse state lives in the mount
 * and survives update() calls. Call update() after any structural change to
 * the tree.
 * @param {HTMLElement} container
 * @param {{
 *   getNodes: () => MapNode[],
 *   getCurrentId: () => string,
 *   onSelect: (nodeId: string) => void,
 *   onAddChild?: (parentId: string) => void,
 *   onEdit?: (nodeId: string) => void,
 *   onDelete?: (nodeId: string) => void,
 *   collapsible?: boolean,
 * }} opts
 * @returns {{ update: () => void }}
 */
export function mountWorldTree(container, opts) {
  const root = el('nav', 'world-tree');
  root.setAttribute('aria-label', 'World hierarchy');
  container.appendChild(root);

  /** Node ids whose children are currently hidden. @type {Set<string>} */
  const collapsed = new Set();

  /**
   * The chevron for a row that has children. Collapsing hides the child list
   * where it stands instead of re-rendering the tree: the subtree's DOM is
   * already built and a collapse changes nothing else about it.
   * @param {WorldTreeNode} treeNode
   * @param {HTMLUListElement} childList
   * @returns {HTMLButtonElement}
   */
  function collapseToggle(treeNode, childList) {
    const nodeId = treeNode.node.id;
    const toggle = el('button', 'world-tree__toggle', icon('chevron', { size: 14 }));
    toggle.type = 'button';

    /** @param {boolean} isCollapsed */
    const apply = (isCollapsed) => {
      toggle.classList.toggle('world-tree__toggle--open', !isCollapsed);
      toggle.setAttribute('aria-expanded', String(!isCollapsed));
      toggle.setAttribute(
        'aria-label',
        `${isCollapsed ? 'Expand' : 'Collapse'} ${treeNode.node.name}`,
      );
      childList.hidden = isCollapsed;
    };

    toggle.addEventListener('click', () => {
      const nowCollapsed = !collapsed.has(nodeId);
      if (nowCollapsed) collapsed.add(nodeId);
      else collapsed.delete(nodeId);
      apply(nowCollapsed);
    });
    apply(collapsed.has(nodeId));
    return toggle;
  }

  /** @param {WorldTreeNode} treeNode @returns {HTMLLIElement} */
  function renderNode(treeNode) {
    // Built before the row so the chevron can close over it. A collapsed
    // subtree is still rendered, just hidden.
    const childList = treeNode.children.length
      ? el('ul', 'world-tree__children', ...treeNode.children.map(renderNode))
      : null;

    const select = el('button', 'row-select', treeNode.node.name);
    select.type = 'button';
    if (treeNode.node.id === opts.getCurrentId()) {
      select.classList.add('row-select--current');
      select.setAttribute('aria-current', 'true');
    }
    select.addEventListener('click', () => opts.onSelect(treeNode.node.id));

    const row = el(
      'div',
      'world-tree__row u-row u-g1',
      // Collapsible trees give every row a fixed-width toggle slot so labels
      // line up; only rows with children get a live chevron in that slot.
      opts.collapsible &&
        (childList
          ? collapseToggle(treeNode, childList)
          : el('span', 'world-tree__toggle world-tree__toggle--leaf')),
      select,
      opts.onAddChild &&
        iconButton(
          'add',
          `Add a child under ${treeNode.node.name}`,
          () => opts.onAddChild?.(treeNode.node.id),
          { className: 'world-tree__action' },
        ),
      opts.onEdit &&
        iconButton('edit', `Edit ${treeNode.node.name}`, () => opts.onEdit?.(treeNode.node.id), {
          className: 'world-tree__action',
        }),
      opts.onDelete &&
        iconButton(
          'remove',
          `Delete ${treeNode.node.name}`,
          () => opts.onDelete?.(treeNode.node.id),
          { variant: 'danger', className: 'world-tree__action' },
        ),
    );

    return el('li', 'world-tree__item', row, childList);
  }

  /** @type {string | null} what the tree on screen was built from */
  let shownSignature = null;

  /**
   * Everything the markup reads: each node's id, name, and parent, plus which
   * row is current. Compared by value rather than by node identity because a
   * party step replaces the node it revealed fog on without changing any of
   * these, and that step is the most frequent caller of update().
   * @param {MapNode[]} nodes
   * @param {string} currentId
   */
  function signatureOf(nodes, currentId) {
    return JSON.stringify([currentId, nodes.map((n) => [n.id, n.name, n.parentId])]);
  }

  function update() {
    const nodes = opts.getNodes();
    // Callers refresh the tree after anything that might have moved a node, so
    // it is asked to redraw far more often than it actually changes. Bail when
    // the markup would come out the same, since rebuilding costs the scroll
    // position and any focus inside the tree.
    const signature = signatureOf(nodes, opts.getCurrentId());
    if (signature === shownSignature) return;
    shownSignature = signature;

    root.innerHTML = '';
    root.appendChild(
      el('ul', 'world-tree__children world-tree__root', ...buildWorldTree(nodes).map(renderNode)),
    );
  }

  update();
  return { update };
}
