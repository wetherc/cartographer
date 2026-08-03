import { icon } from './icons.js';
import { bareButton, iconButton } from './buttons.js';
import { el } from './dom.js';
import { buildWorldTree } from '../map/WorldTree.js';

/** @typedef {import('../types/map.js').MapNode} MapNode */
/** @typedef {import('../map/WorldTree.js').WorldTreeNode} WorldTreeNode */

/**
 * Mount the world tree: a nested list that mirrors the MapNode hierarchy.
 * It always shows the whole tree, not only the path to the current node.
 * It is the Build-mode counterpart to the Play-mode breadcrumb, over the
 * same TileGrid data. A click on a node runs onSelect. If onAddChild,
 * onEdit, or onDelete are set, each row also gets an add-child,
 * edit-settings, and delete control, used in Build mode. If getWarning is
 * set, a row whose node has something wrong gets a warning badge that
 * carries the message. This lets a GM see an unreachable or sealed node
 * at the moment it breaks, not the next time they view it. If
 * collapsible is set, every row with children gets an expand or collapse
 * chevron. Collapse state lives in the mount and survives calls to
 * update(). Call update() after any structural change to the tree.
 * @param {HTMLElement} container
 * @param {{
 *   getNodes: () => MapNode[],
 *   getCurrentId: () => string,
 *   onSelect: (nodeId: string) => void,
 *   onAddChild?: (parentId: string) => void,
 *   onEdit?: (nodeId: string) => void,
 *   onDelete?: (nodeId: string) => void,
 *   getWarning?: (node: MapNode) => string | null,
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
   * Build the chevron for a row with children. A collapse hides the
   * child list in place instead of rerendering the tree. The DOM of the
   * subtree is already built, and a collapse changes nothing else about it.
   * @param {WorldTreeNode} treeNode
   * @param {HTMLUListElement} childList
   * @returns {HTMLButtonElement}
   */
  function collapseToggle(treeNode, childList) {
    const nodeId = treeNode.node.id;
    const toggle = bareButton([icon('chevron', { size: 14 })], undefined, {
      className: 'world-tree__toggle',
    });

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
    // This builds before the row, so the chevron can close over it. A
    // collapsed subtree still renders. It is only hidden.
    const childList = treeNode.children.length
      ? el('ul', 'world-tree__children', ...treeNode.children.map(renderNode))
      : null;

    const select = bareButton([treeNode.node.name], () => opts.onSelect(treeNode.node.id), {
      className: 'row-select',
    });
    if (treeNode.node.id === opts.getCurrentId()) {
      select.classList.add('row-select--current');
      select.setAttribute('aria-current', 'true');
    }

    const warning = opts.getWarning?.(treeNode.node) ?? null;
    /** @type {HTMLSpanElement | null} */
    let badge = null;
    if (warning) {
      badge = el('span', 'world-tree__warning', icon('warning', { size: 14 }));
      badge.setAttribute('role', 'img');
      badge.setAttribute('aria-label', warning);
      badge.title = warning;
    }

    const row = el(
      'div',
      'world-tree__row u-row u-g1',
      // A collapsible tree gives every row a fixed-width toggle slot, so
      // labels line up. Only a row with children gets a live chevron in
      // that slot.
      opts.collapsible &&
        (childList
          ? collapseToggle(treeNode, childList)
          : el('span', 'world-tree__toggle world-tree__toggle--leaf')),
      select,
      badge,
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

  /** @type {string | null} the signature the tree on screen was built from */
  let shownSignature = null;

  /**
   * This returns everything the markup reads: each node's id, name,
   * parent, and warning, plus which row is current. It compares by
   * value, not by node identity, since a party step replaces the node it
   * revealed fog on without changing any of these fields, and that step
   * is the most frequent caller of update(). The warning sits in the
   * signature, so a paint stroke that seals or unseals a node redraws its badge.
   * @param {MapNode[]} nodes
   * @param {string} currentId
   */
  function signatureOf(nodes, currentId) {
    return JSON.stringify([
      currentId,
      nodes.map((n) => [n.id, n.name, n.parentId, opts.getWarning?.(n) ?? null]),
    ]);
  }

  function update() {
    const nodes = opts.getNodes();
    // A caller refreshes the tree after anything that can have moved a
    // node, so it redraws far more often than it changes. Stop when the
    // markup comes out the same, since a rebuild costs the scroll
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
