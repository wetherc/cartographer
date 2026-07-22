import { icon } from './icons.js';
import { buildWorldTree } from '../map/WorldTree.js';

/** @typedef {import('../types/map.js').MapNode} MapNode */
/** @typedef {import('../map/WorldTree.js').WorldTreeNode} WorldTreeNode */

/**
 * Mount the world tree: a nested list mirroring the MapNode hierarchy, always
 * showing the whole tree rather than only the path to the current node. It is
 * the Build-mode counterpart to the Play-mode breadcrumb, over the same
 * TileGrid data. Selecting a node invokes onSelect; if onAddChild/onDelete are
 * supplied, each row also gets an add-child and delete affordance (used in
 * Build mode). Call update() after any structural change to the tree.
 * @param {HTMLElement} container
 * @param {{
 *   getNodes: () => MapNode[],
 *   getCurrentId: () => string,
 *   onSelect: (nodeId: string) => void,
 *   onAddChild?: (parentId: string) => void,
 *   onDelete?: (nodeId: string) => void,
 * }} opts
 * @returns {{ update: () => void }}
 */
export function mountWorldTree(container, opts) {
  const root = document.createElement('nav');
  root.className = 'world-tree';
  root.setAttribute('aria-label', 'World hierarchy');
  container.appendChild(root);

  /** @param {WorldTreeNode} treeNode @returns {HTMLLIElement} */
  function renderNode(treeNode) {
    const li = document.createElement('li');
    li.className = 'world-tree__item';

    const row = document.createElement('div');
    row.className = 'world-tree__row';

    const select = document.createElement('button');
    select.type = 'button';
    select.className = 'world-tree__select';
    select.textContent = treeNode.node.name;
    if (treeNode.node.id === opts.getCurrentId()) {
      select.classList.add('world-tree__select--current');
      select.setAttribute('aria-current', 'true');
    }
    select.addEventListener('click', () => opts.onSelect(treeNode.node.id));
    row.appendChild(select);

    if (opts.onAddChild) {
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'btn btn--icon world-tree__action';
      add.setAttribute('aria-label', `Add a child under ${treeNode.node.name}`);
      add.appendChild(icon('add'));
      add.addEventListener('click', () => opts.onAddChild?.(treeNode.node.id));
      row.appendChild(add);
    }

    if (opts.onDelete) {
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'btn btn--icon btn--danger world-tree__action';
      del.setAttribute('aria-label', `Delete ${treeNode.node.name}`);
      del.appendChild(icon('remove'));
      del.addEventListener('click', () => opts.onDelete?.(treeNode.node.id));
      row.appendChild(del);
    }

    li.appendChild(row);

    if (treeNode.children.length) {
      const childList = document.createElement('ul');
      childList.className = 'world-tree__children';
      for (const child of treeNode.children) childList.appendChild(renderNode(child));
      li.appendChild(childList);
    }

    return li;
  }

  function update() {
    root.innerHTML = '';
    const list = document.createElement('ul');
    list.className = 'world-tree__children world-tree__root';
    for (const treeNode of buildWorldTree(opts.getNodes())) {
      list.appendChild(renderNode(treeNode));
    }
    root.appendChild(list);
  }

  update();
  return { update };
}
