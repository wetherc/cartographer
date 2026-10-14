import { emptyState } from './buttons.js';
import { el, uniqueId } from './dom.js';
import { textField } from './formFields.js';
import { ancestorIds, buildWorldTree, filterWorldTree } from '../map/WorldTreeModel.js';
import { createRefreshScheduler } from '../combat/RefreshScheduler.js';
import { treeKeyAction } from '../view/TreeKeys.js';
import { createTreeRows, focusItem } from './WorldTreeRows.js';

/** @typedef {import('../types/map.js').MapNode} MapNode */

/** A world with at least this many nodes gets the search box above the tree. */
const SEARCH_MIN_NODES = 12;

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
 * sealed node at the moment it breaks, not the next time they view it. If
 * getLock is set, a locked node gets a lock icon that names its key. Call
 * update() after any structural change to the tree.
 * @param {HTMLElement} container
 * @param {import("./WorldTreeRows.js").WorldTreeOptions} opts
 * @returns {{ update: () => void }}
 */
export function mountWorldTree(container, opts) {
  const search = textField('', {
    type: 'search',
    placeholder: 'Find a place',
    className: 'world-tree__search',
    ariaLabel: 'Find a place in the world',
  });
  search.hidden = true;

  const root = el('div', 'world-tree');
  const idPrefix = uniqueId('world-tree');
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
  /** @type {string | null} the tree item in the tab order */
  let tabStopId = null;

  const { renderNode } = createTreeRows({
    opts,
    idPrefix,
    collapsed,
    known,
    closedInSearch,
    toggles,
    rows,
    selects,
    menuOpeners,
    getQuery: () => query,
    getNames: () => names,
    syncTabStop,
  });

  /** @type {string | null} the signature the tree on screen was built from */
  let shownSignature = null;
  /** @type {string | null} the node whose row is marked as current */
  let currentId = null;
  /** @type {HTMLLIElement | null} */
  let currentRow = null;
  /** @type {HTMLLIElement | null} the tree item that has tabIndex 0 */
  let stopRow = null;
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
    // A party step keeps the same current node and the same rows, so the
    // tab stop cannot have moved. A rebuild clears stopRow.
    const moved = id !== currentId || next !== currentRow || !stopRow;
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
    if (moved) syncTabStop();
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
    // Every new row starts with tabIndex -1.
    stopRow = null;

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
   * whole tree in one step instead of through every row. The function
   * changes only the old and the new stop, because the tree updates on
   * every party step and a world can have hundreds of rows.
   */
  function syncTabStop() {
    const pick = (/** @type {string | null} */ id) => {
      const row = id ? rows.get(id) : undefined;
      // Only a closed branch inside the tree counts. A hidden rail around
      // the tree would otherwise move the stop off the current node.
      const closedBranch = row?.closest('[hidden]');
      return row && !(closedBranch && root.contains(closedBranch)) ? row : undefined;
    };
    // A top-level item is never inside a closed branch, so the first item
    // in the markup is the first visible one.
    const first = /** @type {HTMLLIElement | null} */ (root.querySelector('[role="treeitem"]'));
    const stop = pick(tabStopId) ?? pick(currentId) ?? first;
    if (stop === stopRow) return;
    if (stopRow) stopRow.tabIndex = -1;
    if (stop) stop.tabIndex = 0;
    stopRow = stop;
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
