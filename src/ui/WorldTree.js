import { icon } from './icons.js';
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

  /** @param {WorldTreeNode} treeNode @returns {HTMLLIElement} */
  function renderNode(treeNode) {
    const li = document.createElement('li');
    li.className = 'world-tree__item';

    const row = document.createElement('div');
    row.className = 'world-tree__row';

    // Collapsible trees give every row a fixed-width toggle slot so labels
    // line up; only rows with children get a live chevron in that slot.
    const isCollapsed = collapsed.has(treeNode.node.id);
    if (opts.collapsible) {
      if (treeNode.children.length) {
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'world-tree__toggle';
        if (!isCollapsed) toggle.classList.add('world-tree__toggle--open');
        toggle.setAttribute('aria-expanded', String(!isCollapsed));
        toggle.setAttribute(
          'aria-label',
          `${isCollapsed ? 'Expand' : 'Collapse'} ${treeNode.node.name}`,
        );
        toggle.appendChild(icon('chevron', { size: 14 }));
        toggle.addEventListener('click', () => {
          if (isCollapsed) collapsed.delete(treeNode.node.id);
          else collapsed.add(treeNode.node.id);
          update();
        });
        row.appendChild(toggle);
      } else {
        const spacer = document.createElement('span');
        spacer.className = 'world-tree__toggle world-tree__toggle--leaf';
        row.appendChild(spacer);
      }
    }

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

    if (opts.onEdit) {
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'btn btn--icon world-tree__action';
      edit.setAttribute('aria-label', `Edit ${treeNode.node.name}`);
      edit.appendChild(icon('edit'));
      edit.addEventListener('click', () => opts.onEdit?.(treeNode.node.id));
      row.appendChild(edit);
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

    if (treeNode.children.length && !(opts.collapsible && isCollapsed)) {
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
