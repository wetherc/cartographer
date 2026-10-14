import { icon } from './icons.js';
import { setTip } from './Tooltip.js';
import { bareButton } from './buttons.js';
import { el, uniqueId } from './dom.js';
import { markMenuButton, openContextMenu, toggleMenuFrom } from './ContextMenu.js';
import { matchesQuery } from '../map/WorldTreeModel.js';

/** @typedef {import('../types/map.js').MapNode} MapNode */
/** @typedef {import('../map/WorldTreeModel.js').WorldTreeNode} WorldTreeNode */

/**
 * The callbacks of the world tree. See mountWorldTree for what each one does.
 * @typedef {{
 *   getNodes: () => MapNode[],
 *   getCurrentId: () => string,
 *   onSelect: (nodeId: string) => void,
 *   onAddChild?: (parentId: string) => void,
 *   onEdit?: (nodeId: string) => void,
 *   onDelete?: (nodeId: string) => void,
 *   getWarning?: (node: MapNode) => string | null,
 *   getLock?: (node: MapNode) => string | null,
 * }} WorldTreeOptions
 */

/**
 * The state that the mount and the row builder share. The sets and maps
 * belong to the mount. The row builder fills the maps of the rows on screen,
 * which the mount clears before each rebuild.
 * @typedef {{
 *   opts: WorldTreeOptions,
 *   idPrefix: string,
 *   collapsed: Set<string>,
 *   known: Set<string>,
 *   closedInSearch: Set<string>,
 *   toggles: Map<string, (isCollapsed: boolean) => void>,
 *   rows: Map<string, HTMLLIElement>,
 *   selects: Map<string, HTMLButtonElement>,
 *   menuOpeners: Map<string, () => void>,
 *   getQuery: () => string,
 *   getNames: () => Map<string, string>,
 *   syncTabStop: () => void,
 * }} TreeRowState
 */

/**
 * Focus a tree item and scroll its own row into view. The item contains
 * its whole branch, so the browser scroll on focus would show the branch
 * and not the row.
 * @param {HTMLLIElement} item
 */
export function focusItem(item) {
  item.focus({ preventScroll: true });
  item.firstElementChild?.scrollIntoView({ block: 'nearest' });
}

/**
 * Create the row builder of the world tree. `renderNode` builds the tree
 * item of one node and its branch: the chevron, the name button, the lock
 * and warning badges, and the actions button and menu. It records each row
 * in the maps of `state`, so the mount can mark the current row, move the
 * tab stop, and run the arrow keys.
 * @param {TreeRowState} state
 */
export function createTreeRows(state) {
  const { opts, idPrefix, collapsed, known, closedInSearch, toggles, rows, selects, menuOpeners } =
    state;
  const { getQuery, getNames, syncTabStop } = state;
  const menuItems = (/** @type {MapNode} */ node) =>
    [
      opts.onAddChild && { label: 'Add a child', onSelect: () => opts.onAddChild?.(node.id) },
      opts.onEdit && { label: 'Edit settings', onSelect: () => opts.onEdit?.(node.id) },
      opts.onDelete && { label: 'Delete', danger: true, onSelect: () => opts.onDelete?.(node.id) },
    ].filter((item) => !!item);
  const hasActions = Boolean(opts.onAddChild || opts.onEdit || opts.onDelete);

  /**
   * Build the chevron for a row with children. A collapse hides the child
   * list in place instead of rerendering the tree, so the scroll position and
   * focus stay where they are.
   * @param {WorldTreeNode} treeNode
   * @param {HTMLUListElement} childList
   * @param {HTMLElement | null} hiddenBadge shown only while the branch is closed
   * @param {HTMLLIElement} item the tree item, which reports the open state
   * @param {() => void} describe refreshes the description of the tree item
   * @returns {HTMLButtonElement}
   */
  function collapseToggle(treeNode, childList, hiddenBadge, item, describe) {
    const nodeId = treeNode.node.id;
    const closed = getQuery() ? closedInSearch : collapsed;
    const toggle = bareButton([icon('chevron', { size: 14 })], undefined, {
      className: 'world-tree__toggle',
    });
    // The pointer uses the chevron. A keyboard opens and closes the branch
    // with the arrow keys on the tree item, which reports aria-expanded.
    toggle.tabIndex = -1;

    /** @param {boolean} isCollapsed */
    const apply = (isCollapsed) => {
      if (isCollapsed) closed.add(nodeId);
      else closed.delete(nodeId);
      toggle.classList.toggle('world-tree__toggle--open', !isCollapsed);
      item.setAttribute('aria-expanded', String(!isCollapsed));
      childList.hidden = isCollapsed;
      if (hiddenBadge) {
        hiddenBadge.hidden = !isCollapsed;
        describe();
      }
    };

    toggle.addEventListener('click', () => {
      // Focus moves to this row, as for a press on the name. A row that has
      // focus inside a closing branch would otherwise lose it to the page
      // body when the branch hides.
      focusItem(item);
      apply(!closed.has(nodeId));
      // The tab stop can be a row inside the closed branch, and then no
      // visible row is in the tab order.
      syncTabStop();
    });
    toggles.set(nodeId, apply);
    apply(closed.has(nodeId));
    return toggle;
  }

  /**
   * A warning icon with its message as tooltip and accessible name.
   * @param {string} message
   * @param {string} [count] text after the icon
   */
  function warningBadge(message, count) {
    return iconBadge('warning', 'world-tree__warning', message, count);
  }

  /**
   * An icon with its message as tooltip and accessible name.
   * @param {'warning' | 'lock'} name
   * @param {string} className
   * @param {string} message
   * @param {string} [count] text after the icon
   */
  function iconBadge(name, className, message, count) {
    const badge = el('span', className, icon(name, { size: 14 }), count);
    badge.id = uniqueId(`${idPrefix}-badge`);
    badge.setAttribute('role', 'img');
    badge.setAttribute('aria-label', message);
    setTip(badge, message);
    return badge;
  }

  /**
   * @param {WorldTreeNode} treeNode
   * @param {Set<string>} openPath ancestors of the current node
   * @param {string | null} parentId the row one level up
   * @returns {{ item: HTMLLIElement, warnings: number }} the row and the warning count of its branch
   */
  function renderNode(treeNode, openPath, parentId) {
    const { node } = treeNode;
    const hasChildren = treeNode.children.length > 0;
    // A branch gets its first state here, so a region added later starts
    // closed like the rest. A search never sets it, because a search opens
    // every branch it keeps.
    if (hasChildren && !getQuery() && !known.has(node.id)) {
      known.add(node.id);
      if (treeNode.depth > 0 && !openPath.has(node.id)) collapsed.add(node.id);
    }

    const rendered = treeNode.children.map((child) => renderNode(child, openPath, node.id));
    const below = rendered.reduce((sum, r) => sum + r.warnings, 0);

    // A search result names its parent too, since a generated world has many
    // places with one name ("Temple, Ashogate").
    const parentName =
      parentId && getQuery() && matchesQuery(node, getQuery())
        ? getNames().get(parentId)
        : undefined;

    // The arrow keys move focus between the tree items, and only one of them
    // is in the tab order at a time.
    const item = /** @type {HTMLLIElement} */ (el('li', 'world-tree__item'));
    item.setAttribute('role', 'treeitem');
    item.setAttribute('aria-level', String(treeNode.depth + 1));
    item.setAttribute('aria-label', parentName ? `${node.name}, ${parentName}` : node.name);
    if (hasActions) item.setAttribute('aria-keyshortcuts', 'Shift+F10 ContextMenu');
    item.tabIndex = -1;
    item.dataset.nodeId = node.id;
    if (parentId) item.dataset.parentId = parentId;
    rows.set(node.id, item);

    const label = parentName
      ? [node.name, el('span', 'world-tree__parent', `, ${parentName}`)]
      : [node.name];
    const select = bareButton(
      label,
      () => {
        focusItem(item);
        opts.onSelect(node.id);
      },
      { className: 'row-select' },
    );
    select.tabIndex = -1;
    selects.set(node.id, select);

    const warning = opts.getWarning?.(node) ?? null;
    const ownBadge = warning ? warningBadge(warning) : null;
    const lock = opts.getLock?.(node) ?? null;
    const lockBadge = lock ? iconBadge('lock', 'world-tree__lock', lock) : null;
    const hiddenBadge =
      below > 0
        ? warningBadge(
            `${below} ${below === 1 ? 'place' : 'places'} inside ${node.name} ${below === 1 ? 'has' : 'have'} a link warning`,
            String(below),
          )
        : null;
    hiddenBadge?.classList.add('world-tree__warning--hidden');
    // The badges sit in the hidden row, so the tree item names the ones on
    // screen as its description.
    const describe = () => {
      const ids = [lockBadge, ownBadge, hiddenBadge]
        .filter((b) => b && !b.hidden)
        .map((b) => b?.id);
      if (ids.length) item.setAttribute('aria-describedby', ids.join(' '));
      else item.removeAttribute('aria-describedby');
    };

    const childList = hasChildren
      ? el('ul', 'world-tree__children', ...rendered.map((r) => r.item))
      : null;
    childList?.setAttribute('role', 'group');

    const row = el(
      'div',
      'world-tree__row u-row u-g1',
      // Every row gets a fixed-width toggle slot, so labels line up. Only a
      // row with children gets a live chevron in that slot.
      childList
        ? collapseToggle(treeNode, childList, hiddenBadge, item, describe)
        : el('span', 'world-tree__toggle world-tree__toggle--leaf'),
      select,
      lockBadge,
      ownBadge,
      hiddenBadge,
      hasActions && actionsButton(node, item),
    );
    row.setAttribute('aria-hidden', 'true');
    // A press on a row button would focus the button, which sits outside
    // the accessibility tree. The click handlers focus the tree item instead.
    row.addEventListener('mousedown', (event) => event.preventDefault());
    describe();
    if (hasActions) {
      row.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        focusItem(item);
        openContextMenu(menuItems(node), event, null, `Actions for ${node.name}`);
      });
    }

    item.append(row);
    if (childList) item.append(childList);
    return { item, warnings: below + (warning ? 1 : 0) };
  }

  /**
   * @param {MapNode} node
   * @param {HTMLLIElement} item the tree item, which takes focus first so the
   *   menu gives focus back to it
   * @returns {HTMLButtonElement}
   */
  function actionsButton(node, item) {
    const label = `Actions for ${node.name}`;
    const button = bareButton(
      [icon('more', { size: 16 })],
      () => {
        focusItem(item);
        toggleMenuFrom(button, menuItems(node));
      },
      { className: 'world-tree__more', ariaLabel: label, title: label },
    );
    button.tabIndex = -1;
    markMenuButton(button);
    menuOpeners.set(node.id, () => button.click());
    return button;
  }

  return { renderNode };
}
