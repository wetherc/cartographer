import { icon } from './icons.js';
import { setTip } from './Tooltip.js';
import { bareButton, emptyState } from './buttons.js';
import { el } from './dom.js';
import { textField } from './formFields.js';
import { markMenuButton, openContextMenu, toggleMenuFrom } from './ContextMenu.js';
import { ancestorIds, buildWorldTree, filterWorldTree, matchesQuery } from '../map/WorldTree.js';
import { createRefreshScheduler } from '../combat/RefreshScheduler.js';
import { treeKeyAction } from '../view/TreeKeys.js';

/** @typedef {import('../types/map.js').MapNode} MapNode */
/** @typedef {import('../map/WorldTree.js').WorldTreeNode} WorldTreeNode */

/** A world with at least this many nodes gets the search box above the tree. */
const SEARCH_MIN_NODES = 12;

/** Counts mounts, so the element ids of two trees on one page never clash. */
let mountCount = 0;

/**
 * Mount the world tree: a nested list that mirrors the MapNode hierarchy.
 * It shows the whole tree, not only the path to the current node, inside a
 * box that scrolls on its own. Every row with children has an expand or
 * collapse chevron. A branch starts collapsed the first time the tree sees
 * it, unless it is a root or it contains the current node. When the current
 * node changes, the tree opens the branches above it and scrolls its row
 * into view. Collapse state lives in the mount and stays the same through
 * calls to update(). A world with 12 or more nodes also gets a search box,
 * which reduces the tree to the matching places and the paths to them.
 *
 * The tree follows the ARIA tree pattern. Each `li` is a tree item, and the
 * `ul` of its children is a group inside it, so a screen reader reads the
 * nesting and the "n of m" count from the markup. The buttons of a row
 * (chevron, name, warning badges, actions) sit in an `aria-hidden` row for
 * the pointer. For a keyboard and a screen reader the tree item takes their
 * place: it has the name as its label, the badges as its description, and
 * Shift+F10 for the menu. The tree is one tab stop, and the arrow keys move
 * between rows and open or close branches (see TreeKeys.js).
 *
 * A click on a node runs onSelect. If onAddChild, onEdit, or onDelete are
 * set, each row gets one actions button that opens a menu with those
 * choices, and a right-click on the row opens the same menu. Build mode uses
 * these. If getWarning is set, a row whose node has something wrong gets a
 * warning badge that gives the message, and a collapsed row counts the
 * warnings in the branch it hides. This lets a GM see an unreachable or
 * sealed node at the moment it breaks, not the next time they view it. Call
 * update() after any structural change to the tree.
 * @param {HTMLElement} container
 * @param {{
 *   getNodes: () => MapNode[],
 *   getCurrentId: () => string,
 *   onSelect: (nodeId: string) => void,
 *   onAddChild?: (parentId: string) => void,
 *   onEdit?: (nodeId: string) => void,
 *   onDelete?: (nodeId: string) => void,
 *   getWarning?: (node: MapNode) => string | null,
 * }} opts
 * @returns {{ update: () => void }}
 */
export function mountWorldTree(container, opts) {
  const search = textField('', { type: 'search', placeholder: 'Find a place' });
  search.classList.add('world-tree__search');
  search.setAttribute('aria-label', 'Find a place in the world');
  search.hidden = true;

  const root = el('div', 'world-tree');
  const idPrefix = `world-tree-${++mountCount}`;
  container.append(search, root);

  /** Node ids whose children are hidden. @type {Set<string>} */
  const collapsed = new Set();
  /** Node ids whose first collapse state is already set. @type {Set<string>} */
  const known = new Set();
  /** Branches closed during the current search. A new query opens them all. @type {Set<string>} */
  const closedInSearch = new Set();
  /** The open-or-close function of each chevron on screen, by node id. @type {Map<string, (isCollapsed: boolean) => void>} */
  const toggles = new Map();
  /** The tree item of each row on screen, by node id. @type {Map<string, HTMLLIElement>} */
  const rows = new Map();
  /** The name button of each row on screen, by node id. @type {Map<string, HTMLButtonElement>} */
  const selects = new Map();
  /** Opens the actions menu of each row on screen, by node id. @type {Map<string, () => void>} */
  const menuOpeners = new Map();

  /** @type {string} the trimmed search text the tree on screen was built from */
  let query = '';
  /** @type {Map<string, string>} node id to name, for the parent names in search results */
  let names = new Map();
  /** Numbers the warning badges for their element ids. */
  let warningCount = 0;
  /** @type {string | null} the tree item in the tab order */
  let tabStopId = null;

  const menuItems = (/** @type {MapNode} */ node) =>
    [
      opts.onAddChild && { label: 'Add a child', onSelect: () => opts.onAddChild?.(node.id) },
      opts.onEdit && { label: 'Edit settings', onSelect: () => opts.onEdit?.(node.id) },
      opts.onDelete && { label: 'Delete', danger: true, onSelect: () => opts.onDelete?.(node.id) },
    ].filter((item) => !!item);
  const hasActions = Boolean(opts.onAddChild || opts.onEdit || opts.onDelete);

  /**
   * Focus a tree item and scroll its own row into view. The item contains
   * its whole branch, so the browser scroll on focus would show the branch
   * and not the row.
   * @param {HTMLLIElement} item
   */
  function focusItem(item) {
    item.focus({ preventScroll: true });
    item.firstElementChild?.scrollIntoView({ block: 'nearest' });
  }

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
    const closed = query ? closedInSearch : collapsed;
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
    const badge = el('span', 'world-tree__warning', icon('warning', { size: 14 }), count);
    badge.id = `${idPrefix}-warning-${++warningCount}`;
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
    if (hasChildren && !query && !known.has(node.id)) {
      known.add(node.id);
      if (treeNode.depth > 0 && !openPath.has(node.id)) collapsed.add(node.id);
    }

    const rendered = treeNode.children.map((child) => renderNode(child, openPath, node.id));
    const below = rendered.reduce((sum, r) => sum + r.warnings, 0);

    // A search result names its parent too, since a generated world has many
    // places with one name ("Temple, Ashogate").
    const parentName =
      parentId && query && matchesQuery(node, query) ? names.get(parentId) : undefined;

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
      const ids = [ownBadge, hiddenBadge].filter((b) => b && !b.hidden).map((b) => b?.id);
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
      { className: 'world-tree__more' },
    );
    button.tabIndex = -1;
    button.setAttribute('aria-label', label);
    markMenuButton(button);
    setTip(button, label);
    menuOpeners.set(node.id, () => button.click());
    return button;
  }

  /** @type {string | null} the signature the tree on screen was built from */
  let shownSignature = null;
  /** @type {string | null} the node whose row is marked as current */
  let currentId = null;
  /** @type {HTMLLIElement | null} */
  let currentRow = null;
  /** True while the current row still needs to scroll into view. */
  let scrollPending = false;

  /**
   * Scroll the tree box so the current row is inside it. A box with no
   * height is hidden, for example the Build rail in Play mode, so the scroll
   * waits until the resize observer below sees the box appear.
   */
  function scrollToCurrent() {
    const line = currentRow?.firstElementChild;
    if (!scrollPending || !line || root.clientHeight === 0) return;
    scrollPending = false;
    const box = root.getBoundingClientRect();
    const row = line.getBoundingClientRect();
    const margin = row.height;
    if (row.top < box.top) root.scrollTop -= box.top - row.top + margin;
    else if (row.bottom > box.bottom) root.scrollTop += row.bottom - box.bottom + margin;
  }
  new ResizeObserver(scrollToCurrent).observe(root);

  /**
   * Move the current-node mark to the row of `id`. Navigation changes only
   * this mark, so it touches two rows instead of rebuilding the tree. A new
   * current node opens the branches above it and scrolls into view.
   * @param {string} id
   * @param {MapNode[]} nodes
   */
  function markCurrent(id, nodes) {
    const next = rows.get(id) ?? null;
    if (id !== currentId) {
      for (const ancestor of ancestorIds(nodes, id)) {
        collapsed.delete(ancestor);
        toggles.get(ancestor)?.(false);
      }
      scrollPending = true;
    }
    if (next !== currentRow) {
      if (currentId) selects.get(currentId)?.classList.remove('row-select--current');
      selects.get(id)?.classList.add('row-select--current');
      currentRow?.removeAttribute('aria-current');
      currentRow?.removeAttribute('aria-selected');
      next?.setAttribute('aria-current', 'true');
      next?.setAttribute('aria-selected', 'true');
      currentRow = next;
    }
    currentId = id;
    syncTabStop();
    scrollToCurrent();
  }

  /**
   * This returns everything the markup reads: the search text and each
   * node's id, name, parent, and warning. The current row is left out,
   * because markCurrent moves that mark without a rebuild. It compares by
   * value, not by node identity, since a party step replaces the node it
   * revealed fog on without changing any of these fields, and that step
   * is the most frequent caller of update(). The warning sits in the
   * signature, so a paint stroke that seals or unseals a node redraws its badge.
   * @param {MapNode[]} nodes
   */
  function signatureOf(nodes) {
    return JSON.stringify([
      query,
      nodes.map((n) => [n.id, n.name, n.parentId, opts.getWarning?.(n) ?? null]),
    ]);
  }

  /** @param {MapNode[]} nodes */
  function rebuild(nodes) {
    const focused = [...rows.values()].find((row) => row === document.activeElement);
    const scrollTop = root.scrollTop;
    rows.clear();
    selects.clear();
    toggles.clear();
    menuOpeners.clear();
    currentRow = null;

    names = new Map(nodes.map((n) => [n.id, n.name]));
    const openPath = new Set(ancestorIds(nodes, opts.getCurrentId()));
    const tree = filterWorldTree(buildWorldTree(nodes), query);
    // With no search, an empty tree has no nodes at all. That is the tree of a
    // Player tab, which lists no place, so it shows no message either.
    if (tree.length) {
      const list = el(
        'ul',
        'world-tree__children world-tree__root',
        ...tree.map((t) => renderNode(t, openPath, null).item),
      );
      list.setAttribute('role', 'tree');
      list.setAttribute('aria-label', 'World hierarchy');
      root.replaceChildren(list);
    } else if (query.trim()) {
      root.replaceChildren(emptyState(`No place matches "${query}".`));
    } else {
      root.replaceChildren();
    }
    root.scrollTop = scrollTop;
    if (!focused) return;
    // A delete removes the focused row. Focus then goes to its parent row,
    // or to the current map, so it does not drop to the page body.
    const { nodeId = '', parentId = '' } = focused.dataset;
    const next =
      rows.get(nodeId) ?? rows.get(parentId) ?? rows.get(opts.getCurrentId()) ?? visibleItems()[0];
    if (next) focusItem(next);
  }

  function render() {
    const nodes = opts.getNodes();
    search.hidden = nodes.length < SEARCH_MIN_NODES;
    if (search.hidden) search.value = '';
    const nextQuery = search.value.trim();
    if (nextQuery !== query) closedInSearch.clear();
    query = nextQuery;
    // A caller refreshes the tree after anything that can have moved a
    // node, so it redraws far more often than it changes. Stop when the
    // markup comes out the same, since a rebuild costs the scroll
    // position and any focus inside the tree.
    const signature = signatureOf(nodes);
    if (signature !== shownSignature) {
      shownSignature = signature;
      rebuild(nodes);
    }
    markCurrent(opts.getCurrentId(), nodes);
  }

  /** The tree items not hidden inside a closed branch, in screen order. */
  const visibleItems = () =>
    [...root.querySelectorAll('[role="treeitem"]')]
      .map((row) => /** @type {HTMLLIElement} */ (row))
      .filter((row) => !row.closest('[hidden]'));

  /**
   * Put exactly one tree item in the tab order: the one that last had focus,
   * else the current node, else the first item. Tab then moves past the
   * whole tree in one step instead of through every row.
   */
  function syncTabStop() {
    const visible = visibleItems();
    const pick = (/** @type {string | null} */ id) => {
      const row = id ? rows.get(id) : undefined;
      return row && visible.includes(row) ? row : undefined;
    };
    const stop = pick(tabStopId) ?? pick(currentId) ?? visible[0];
    for (const row of rows.values()) row.tabIndex = row === stop ? 0 : -1;
  }

  root.addEventListener('focusin', (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    // A button of the aria-hidden row that takes focus by some other path,
    // such as a script, hands it to its tree item. A screen reader would
    // otherwise sit on a control that it cannot read.
    const hiddenRow = target.closest?.('.world-tree__row');
    if (hiddenRow) {
      const item = hiddenRow.closest('[role=treeitem]');
      if (item instanceof HTMLLIElement) focusItem(item);
      return;
    }
    const id = target.dataset?.nodeId;
    if (!id) return;
    tabStopId = id;
    syncTabStop();
  });

  root.addEventListener('keydown', (event) => {
    const id = /** @type {HTMLElement} */ (event.target).dataset?.nodeId;
    if (!id) return;
    const items = visibleItems().map((row) => ({
      id: row.dataset.nodeId ?? '',
      parentId: row.dataset.parentId ?? null,
      expanded: row.hasAttribute('aria-expanded')
        ? row.getAttribute('aria-expanded') === 'true'
        : null,
    }));
    const action = treeKeyAction(event, items, id);
    if (!action) return;
    event.preventDefault();
    const go = (/** @type {string} */ to) => {
      const row = rows.get(to);
      if (row) focusItem(row);
    };
    if ('focus' in action) go(action.focus);
    else if ('expand' in action) toggles.get(action.expand)?.(false);
    else if ('collapse' in action) toggles.get(action.collapse)?.(true);
    else if ('select' in action) opts.onSelect(action.select);
    else menuOpeners.get(action.menu)?.();
    syncTabStop();
  });

  search.addEventListener('input', render);
  search.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !search.value) return;
    event.preventDefault();
    search.value = '';
    render();
  });

  // One navigation calls update() two or three times, from the resync, the
  // exit sync, and the travel code. Each signature runs getWarning for every
  // node, so the calls of one handler share a single render in a microtask,
  // which still runs before the browser paints.
  const scheduler = createRefreshScheduler(render);

  render();
  return { update: scheduler.request };
}
