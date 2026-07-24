import { addItem, removeItem, updateItem } from '../entities/Character.js';
import {
  EQUIPMENT_SLOTS,
  ITEM_TYPES,
  itemType,
  itemSummary,
  filterItems,
  equip,
  getEquipped,
  slotAccepts,
} from '../entities/Equipment.js';
import { buildItemForm } from './ItemForm.js';
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
 * Equipment slot rows: a labeled select per slot, its options limited to the
 * inventory items whose type the slot accepts (a potion never appears in the
 * armor pickers), ordered by the slot's preference then name. An already-
 * equipped item that no longer passes the filter (a legacy save) still shows,
 * so it can be seen and unequipped.
 * @param {Character} character
 * @param {(next: Character) => void} commit
 * @param {boolean} playable false renders the pickers disabled (read-only view)
 * @returns {HTMLElement}
 */
function buildEquipment(character, commit, playable) {
  const section = document.createElement('div');
  section.className = 'inventory-panel__equipment';
  for (const slot of EQUIPMENT_SLOTS) {
    const row = document.createElement('label');
    row.className = 'inventory-panel__slot';

    const label = document.createElement('span');
    label.className = 'inventory-panel__slot-label';
    label.textContent = slot.label;

    const select = document.createElement('select');
    select.className = 'field';
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = '—';
    select.appendChild(empty);
    const equippedId = getEquipped(character, slot.key)?.id ?? '';
    const eligible = character.inventory
      .filter((i) => slotAccepts(slot.key, i) || i.id === equippedId)
      .sort((a, b) => {
        const rank = (/** @type {typeof a} */ i) => {
          const at = slot.accepts.indexOf(itemType(i));
          return at === -1 ? slot.accepts.length : at;
        };
        return rank(a) - rank(b) || a.name.localeCompare(b.name);
      });
    for (const item of eligible) {
      const option = document.createElement('option');
      option.value = item.id;
      const summary = itemSummary(item);
      option.textContent = summary ? `${item.name} (${summary})` : item.name;
      select.appendChild(option);
    }
    select.value = equippedId;
    select.disabled = !playable;
    select.addEventListener('change', () =>
      commit(equip(character, slot.key, select.value === '' ? null : select.value)),
    );

    row.append(label, select);
    section.appendChild(row);
  }
  return section;
}

/**
 * Mount the character's kit as two tabs behind a collapsed disclosure:
 * Equipment (the default — slot pickers for what's worn and wielded) and
 * Inventory (a searchable, type-filterable, sortable item list with add,
 * consume, discard, and full post-creation editing via the shared item form).
 * Renders an empty state when no character is selected (`null`).
 * Item interactions (add, consume, discard) are reported through `onEvent`
 * with the acting character, so the caller can log them; equipment changes
 * and edits commit silently.
 * @param {HTMLElement} container
 * @param {Character | null} initial
 * With a `canPlay` callback returning false the panel renders read-only: no
 * equipment changes, no consume/remove/edit controls, no add form (a
 * spectator's or another player's view of this character).
 * @param {(character: Character) => void} [onChange]
 * @param {(event: InventoryEvent, character: Character) => void} [onEvent]
 * @param {() => boolean} [canPlay]
 * @returns {{ getCharacter: () => Character | null, setCharacter: (character: Character | null) => void }}
 */
export function mountInventoryPanel(
  container,
  initial,
  onChange = () => {},
  onEvent = () => {},
  canPlay = () => true,
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
  /** @type {string | null} id of the item whose edit form is open */
  let editingId = null;

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

  /**
   * One inventory row: name, stack count, description, and the mechanical
   * summary — plus edit/consume/discard controls when playable. The open edit
   * form (shared with the add form) renders in the row's place.
   * @param {Character} character
   * @param {InventoryItem} item
   * @param {boolean} playable
   * @returns {HTMLElement}
   */
  function buildRow(character, item, playable) {
    if (item.id === editingId) {
      const editor = document.createElement('div');
      editor.className = 'inventory-panel__editor';
      editor.appendChild(
        buildItemForm({
          item,
          submitLabel: `Save ${item.name}`,
          onSubmit: (fields) => {
            editingId = null;
            commit(updateItem(character, item.id, { ...fields, id: item.id }));
          },
          onCancel: () => {
            editingId = null;
            render();
          },
        }),
      );
      return editor;
    }

    const row = document.createElement('div');
    row.className = 'inventory-panel__row';

    const main = document.createElement('div');
    main.className = 'inventory-panel__item';

    const line = document.createElement('div');
    line.className = 'inventory-panel__item-line';
    const label = document.createElement('span');
    label.className = 'inventory-panel__label';
    label.textContent = `${item.name} x${item.quantity}`;
    const type = document.createElement('span');
    type.className = 'inventory-panel__type';
    const effects = itemSummary(item);
    type.textContent = effects ? `${itemType(item)} — ${effects}` : itemType(item);
    line.append(label, type);
    main.appendChild(line);

    if (item.description) {
      const description = document.createElement('div');
      description.className = 'inventory-panel__description';
      description.textContent = item.description;
      main.appendChild(description);
    }
    row.appendChild(main);

    if (!playable) return row;

    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'btn btn--icon';
    editButton.setAttribute('aria-label', `Edit ${item.name}`);
    editButton.appendChild(icon('edit'));
    editButton.addEventListener('click', () => {
      editingId = item.id;
      render();
    });
    row.appendChild(editButton);

    // Present even on 1-stacks: consuming the last of an item and discarding
    // it are the same state change but different travelogue lines.
    const consumeButton = document.createElement('button');
    consumeButton.type = 'button';
    consumeButton.className = 'btn btn--icon';
    consumeButton.setAttribute('aria-label', `Consume one ${item.name}`);
    consumeButton.appendChild(icon('minus'));
    consumeButton.addEventListener('click', () =>
      commit(removeItem(character, item.id, 1), { verb: 'use', itemName: item.name, count: 1 }),
    );
    row.appendChild(consumeButton);

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'btn btn--icon btn--danger';
    removeButton.setAttribute('aria-label', `Remove all ${item.name}`);
    removeButton.appendChild(icon('remove'));
    removeButton.addEventListener('click', () =>
      commit(removeItem(character, item.id, item.quantity), {
        verb: 'discard',
        itemName: item.name,
        count: item.quantity,
      }),
    );
    row.appendChild(removeButton);
    return row;
  }

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
    for (const [value, text] of [['name', 'by name'], ['type', 'by type'], ['quantity', 'by quantity']]) {
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
      const visible = filterItems(character.inventory, { query: searchQuery, type: typeFilter, sort: sortKey });
      if (visible.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'empty-state';
        empty.textContent = character.inventory.length === 0 ? 'No items yet.' : 'No items match.';
        list.appendChild(empty);
        return;
      }
      for (const item of visible) list.appendChild(buildRow(character, item, playable));
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
            commit(
              addItem(character, { ...fields, id }),
              { verb: 'pickup', itemName: fields.name, count: fields.quantity },
            );
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
      const nextTab = /** @type {HTMLElement | null} */ (root.querySelector('[role=tab][aria-selected=true]'));
      nextTab?.focus();
    });
    tablist.append(...tabs);

    body.append(tablist, panels.equipment, panels.inventory);

    wireDisclosure(summary, body, { expanded, onToggle: (next) => { expanded = next; } });
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
