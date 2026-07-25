import { addItem } from '../entities/Character.js';
import { ITEM_TYPES, filterItems } from '../entities/Equipment.js';
import { emptyState } from './buttons.js';
import { buildItemForm } from './ItemForm.js';
import { buildEquipment } from './InventoryEquipment.js';
import { buildRow } from './InventoryRows.js';

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
 * Mount the character's kit across two separate host elements — Equipment
 * (slot pickers for what's worn and wielded, built in InventoryEquipment.js)
 * and Inventory (a searchable, type-filterable, sortable item list with add,
 * consume, discard, and full post-creation editing via the shared item form;
 * the rows themselves are built in InventoryRows.js). The two hosts live under
 * separate top-level tabs, so the panel renders each into its own element and
 * owns neither the tab strip nor any collapse behaviour. Renders an empty state
 * in both hosts when no character is selected (`null`).
 * Item interactions (add, consume, discard) are reported through `onEvent`
 * with the acting character, so the caller can log them; equipment changes
 * and edits commit silently.
 * @param {HTMLElement} equipmentHost the Equipment tab's panel element
 * @param {HTMLElement} inventoryHost the Inventory tab's panel element
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
  equipmentHost,
  inventoryHost,
  initial,
  onChange = () => {},
  onEvent = () => {},
  canPlay = () => true,
  canEdit = () => true,
  transfer = undefined,
) {
  let current = initial;
  // The search/filter/sort choices survive re-renders (every edit re-renders)
  // but stay per-mount, so they persist while the GM works through the list.
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
        list.appendChild(
          emptyState(character.inventory.length === 0 ? 'No items yet.' : 'No items match.'),
        );
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
    equipmentHost.innerHTML = '';
    inventoryHost.innerHTML = '';

    // Captured non-null so listeners created below keep the narrowing.
    const character = current;
    if (!character) {
      for (const host of [equipmentHost, inventoryHost]) {
        host.appendChild(emptyState('No character selected.'));
      }
      return;
    }

    const playable = canPlay();
    equipmentHost.appendChild(buildEquipment(character, commit, playable));
    inventoryHost.appendChild(buildInventoryTab(character, playable));
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
