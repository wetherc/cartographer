import { addItem } from '../entities/Character.js';
import { ITEM_TYPES, filterItems } from '../entities/Equipment.js';
import { buildItemForm } from './ItemForm.js';
import { buildEquipment } from './InventoryEquipment.js';
import { buildRow } from './InventoryRows.js';
import { wireDisclosure } from './Disclosure.js';
import { icon } from './icons.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/entities.js').ItemType} ItemType */
/** @typedef {import('../types/entities.js').InventoryItem} InventoryItem */
/** @typedef {import('../entities/InventoryLog.js').InventoryEvent} InventoryEvent */

/**
 * Derive a stable item id from its name so adding the same item twice stacks
 * quantity onto the existing row instead of creating a duplicate one.
 * @param {string} name
 * @returns {string}
 */
function idFromName(name) {
  return name.trim().toLowerCase().replace(/\s+/g, '-');
}

/**
 * Mount the character's kit as two tabs behind a collapsed disclosure:
 * Equipment (the default — slot pickers for what's worn and wielded, built in
 * InventoryEquipment.js) and Inventory (a searchable, type-filterable,
 * sortable item list with add, consume, discard, and full post-creation
 * editing via the shared item form; the rows themselves are built in
 * InventoryRows.js). Renders an empty state when no character is selected
 * (`null`).
 * Item interactions (add, consume, discard) are reported through `onEvent`
 * with the acting character, so the caller can log them; equipment changes
 * and edits commit silently.
 * @param {HTMLElement} container
 * @param {Character | null} initial
 * With a `canPlay` callback returning false the panel renders read-only: no
 * equipment changes, no consume/remove/edit controls, no add form (a
 * spectator's or another player's view of this character).
 * With `transfer` wired, each row grows a give control: pick another party
 * member and a count, and the panel hands the stack over through
 * `transfer.send` — the caller owns moving the items and re-rendering, since
 * both characters change.
 * Item stats are GM-adjudicated: the per-row edit form only appears when
 * `canEdit` also returns true, so a player tab can use, give, and discard its
 * items but never rewrite what they do.
 * @param {(character: Character) => void} [onChange]
 * @param {(event: InventoryEvent, character: Character) => void} [onEvent]
 * @param {() => boolean} [canPlay]
 * @param {() => boolean} [canEdit]
 * @param {{ recipients: () => { id: string, name: string }[],
 *   send: (item: InventoryItem, count: number, recipientId: string) => void }} [transfer]
 * @returns {{ getCharacter: () => Character | null, setCharacter: (character: Character | null) => void }}
 */
export function mountInventoryPanel(
  container,
  initial,
  onChange = () => {},
  onEvent = () => {},
  canPlay = () => true,
  canEdit = () => true,
  transfer = undefined,
) {
  let current = initial;
  // All view state survives re-renders (every edit re-renders) but stays
  // per-mount: the disclosure stays open, the active tab holds, and the
  // search/filter/sort choices persist while the GM works through the list.
  let expanded = false;
  /** @type {'equipment' | 'inventory'} */
  let activeTab = 'equipment';
  let searchQuery = '';
  /** @type {ItemType | ''} */
  let typeFilter = '';
  /** @type {'name' | 'type' | 'quantity'} */
  let sortKey = 'name';
  /** Which item's edit or give form is open; shared with the row builders. */
  const view = {
    /** @type {string | null} */ editingId: null,
    /** @type {string | null} */ givingId: null,
  };

  const root = document.createElement('div');
  root.className = 'inventory-panel';
  container.appendChild(root);

  /**
   * @param {Character} next
   * @param {InventoryEvent} [event] the interaction that produced `next`, when loggable
   */
  function commit(next, event) {
    current = next;
    onChange(next);
    if (event) onEvent(event, next);
    render();
  }

  /** @type {import('./InventoryRows.js').RowContext} */
  const rowContext = { view, commit, render, canEdit, transfer };

  /**
   * The Inventory tab: search/filter/sort controls over the item list, plus
   * the add form when playable. The controls re-fill only the list on input,
   * so typing in the search box never loses focus to a re-render.
   * @param {Character} character
   * @param {boolean} playable
   * @returns {HTMLElement}
   */
  function buildInventoryTab(character, playable) {
    const panel = document.createElement('div');

    const controls = document.createElement('div');
    controls.className = 'inventory-panel__controls';

    const searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.placeholder = 'Search items';
    searchInput.className = 'field inventory-panel__search';
    searchInput.value = searchQuery;
    searchInput.setAttribute('aria-label', 'Search items by name or description');

    const filterSelect = document.createElement('select');
    filterSelect.className = 'field';
    filterSelect.setAttribute('aria-label', 'Filter by item type');
    const allTypes = document.createElement('option');
    allTypes.value = '';
    allTypes.textContent = 'all types';
    filterSelect.appendChild(allTypes);
    for (const t of ITEM_TYPES) {
      const option = document.createElement('option');
      option.value = t;
      option.textContent = t;
      filterSelect.appendChild(option);
    }
    filterSelect.value = typeFilter;

    const sortSelect = document.createElement('select');
    sortSelect.className = 'field';
    sortSelect.setAttribute('aria-label', 'Sort items');
    for (const [value, text] of [
      ['name', 'by name'],
      ['type', 'by type'],
      ['quantity', 'by quantity'],
    ]) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = text;
      sortSelect.appendChild(option);
    }
    sortSelect.value = sortKey;

    controls.append(searchInput, filterSelect, sortSelect);
    panel.appendChild(controls);

    const list = document.createElement('div');
    list.className = 'inventory-panel__list';
    const fillList = () => {
      list.innerHTML = '';
      const visible = filterItems(character.inventory, {
        query: searchQuery,
        type: typeFilter,
        sort: sortKey,
      });
      if (visible.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'empty-state';
        empty.textContent = character.inventory.length === 0 ? 'No items yet.' : 'No items match.';
        list.appendChild(empty);
        return;
      }
      for (const item of visible) list.appendChild(buildRow(character, item, playable, rowContext));
    };
    fillList();
    panel.appendChild(list);

    searchInput.addEventListener('input', () => {
      searchQuery = searchInput.value;
      fillList();
    });
    filterSelect.addEventListener('change', () => {
      typeFilter = /** @type {ItemType | ''} */ (filterSelect.value);
      fillList();
    });
    sortSelect.addEventListener('change', () => {
      sortKey = /** @type {typeof sortKey} */ (sortSelect.value);
      fillList();
    });

    if (playable) {
      panel.appendChild(
        buildItemForm({
          submitLabel: 'Add item',
          onSubmit: (fields) => {
            const id = idFromName(fields.name);
            commit(addItem(character, { ...fields, id }), {
              verb: 'pickup',
              itemName: fields.name,
              count: fields.quantity,
            });
          },
        }),
      );
    }
    return panel;
  }

  function render() {
    root.innerHTML = '';

    // Captured non-null so listeners created below keep the narrowing.
    const character = current;
    if (!character) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'No character selected.';
      root.appendChild(empty);
      return;
    }

    const itemCount = character.inventory.reduce((sum, item) => sum + item.quantity, 0);
    const summary = document.createElement('button');
    summary.type = 'button';
    summary.className = 'disclosure inventory-panel__summary';
    const summaryLabel = document.createElement('span');
    summaryLabel.textContent = itemCount === 1 ? '1 item' : `${itemCount} items`;
    summary.append(summaryLabel, icon('chevron', { className: 'disclosure__chevron' }));

    const body = document.createElement('div');
    body.className = 'inventory-panel__body';

    const playable = canPlay();

    // The two tabs, wired directly (state lives in this mount, not the DOM,
    // so the active tab survives the full re-render every commit triggers).
    const tablist = document.createElement('div');
    tablist.className = 'tabs inventory-panel__tabs';
    tablist.setAttribute('role', 'tablist');
    tablist.setAttribute('aria-label', 'Equipment and inventory');

    const panels = {
      equipment: buildEquipment(character, commit, playable),
      inventory: buildInventoryTab(character, playable),
    };
    const tabs = /** @type {const} */ ([
      ['equipment', 'Equipment'],
      ['inventory', 'Inventory'],
    ]).map(([key, text]) => {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'tabs__tab';
      tab.setAttribute('role', 'tab');
      tab.textContent = text;
      const selected = activeTab === key;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      panels[key].hidden = !selected;
      tab.addEventListener('click', () => {
        activeTab = key;
        render();
      });
      return tab;
    });
    tablist.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      activeTab = activeTab === 'equipment' ? 'inventory' : 'equipment';
      render();
      const nextTab = /** @type {HTMLElement | null} */ (
        root.querySelector('[role=tab][aria-selected=true]')
      );
      nextTab?.focus();
    });
    tablist.append(...tabs);

    body.append(tablist, panels.equipment, panels.inventory);

    wireDisclosure(summary, body, {
      expanded,
      onToggle: (next) => {
        expanded = next;
      },
    });
    root.append(summary, body);
  }

  render();
  return {
    getCharacter: () => current,
    /** Sync in an externally-updated character (e.g. from a sibling panel) and re-render. */
    setCharacter: (next) => {
      current = next;
      render();
    },
  };
}
