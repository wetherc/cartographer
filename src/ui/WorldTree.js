import { icon } from './icons.js';
import { iconButton } from './buttons.js';
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
  const root = document.createElement('nav');
  root.className = 'world-tree';
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
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'world-tree__toggle';
    toggle.appendChild(icon('chevron', { size: 14 }));

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
    const li = document.createElement('li');
    li.className = 'world-tree__item';

    const row = document.createElement('div');
    row.className = 'world-tree__row';

    // Built before the row so the chevron can close over it. A collapsed
    // subtree is still rendered, just hidden.
    /** @type {HTMLUListElement | null} */
    let childList = null;
    if (treeNode.children.length) {
      childList = document.createElement('ul');
      childList.className = 'world-tree__children';
      for (const child of treeNode.children) childList.appendChild(renderNode(child));
    }

    // Collapsible trees give every row a fixed-width toggle slot so labels
    // line up; only rows with children get a live chevron in that slot.
    if (opts.collapsible) {
      if (childList) {
        row.appendChild(collapseToggle(treeNode, childList));
      } else {
        const spacer = document.createElement('span');
        spacer.className = 'world-tree__toggle world-tree__toggle--leaf';
        row.appendChild(spacer);
      }
    }

    const select = document.createElement('button');
    select.type = 'button';
    select.className = 'row-select';
    select.textContent = treeNode.node.name;
    if (treeNode.node.id === opts.getCurrentId()) {
      select.classList.add('row-select--current');
      select.setAttribute('aria-current', 'true');
    }
    select.addEventListener('click', () => opts.onSelect(treeNode.node.id));
    row.appendChild(select);

    if (opts.onAddChild) {
      row.appendChild(
        iconButton(
          'add',
          `Add a child under ${treeNode.node.name}`,
          () => opts.onAddChild?.(treeNode.node.id),
          { className: 'world-tree__action' },
        ),
      );
    }

    if (opts.onEdit) {
      row.appendChild(
        iconButton('edit', `Edit ${treeNode.node.name}`, () => opts.onEdit?.(treeNode.node.id), {
          className: 'world-tree__action',
        }),
      );
    }

    if (opts.onDelete) {
      row.appendChild(
        iconButton(
          'remove',
          `Delete ${treeNode.node.name}`,
          () => opts.onDelete?.(treeNode.node.id),
          { variant: 'danger', className: 'world-tree__action' },
        ),
      );
    }

    li.appendChild(row);
    if (childList) li.appendChild(childList);

    return li;
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
    const list = document.createElement('ul');
    list.className = 'world-tree__children world-tree__root';
    for (const treeNode of buildWorldTree(nodes)) {
      list.appendChild(renderNode(treeNode));
    }
    root.appendChild(list);
  }

  update();
  return { update };
}
