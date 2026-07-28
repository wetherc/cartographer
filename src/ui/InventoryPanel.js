import { addItem } from '../entities/Character.js';
import { ITEM_TYPES, filterItems } from '../entities/Equipment.js';
import { emptyState } from './buttons.js';
import { select, textField } from './formFields.js';
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
  // The search/filter/sort choices survive a re-render but stay per-mount, so
  // they persist while the GM works through the list.
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

  /** @type {(() => void) | null} refill the mounted Inventory tab's item list */
  let refillList = null;
  /** What the two hosts on screen were built for, so a sync can tell whether
   * anything this panel draws has actually changed. */
  let shown = { character: initial, playable: false, editable: false };

  /** The item list alone, leaving the search box (and its focus), the sort and
   * filter choices, and the add form where they are. */
  function refreshList() {
    refillList?.();
  }

  /**
   * @param {Character} next
   * @param {InventoryEvent} [event] the interaction that produced `next`, when loggable
   * @param {'all' | 'equipment'} [scope] which hosts the change can be seen in
   */
  function commit(next, event, scope = 'all') {
    current = next;
    shown = { ...shown, character: next };
    onChange(next);
    if (event) onEvent(event, next);
    // Equipping never changes a row, but adding or spending an item changes
    // what the slot pickers can offer, so the narrow scope only runs one way.
    renderEquipment();
    if (scope === 'all') refreshList();
  }

  /** The character a row or a slot picker writes against, read when the control
   * is used rather than when it was built. Only ever called from a control that
   * exists, which means a character is selected. */
  const liveCharacter = () => /** @type {Character} */ (current);

  /** @type {import('./InventoryRows.js').RowContext} */
  // A row's own render() only opens or closes its edit/give form, which lives
  // inside the list.
  const rowContext = {
    view,
    getCharacter: liveCharacter,
    commit,
    render: refreshList,
    canEdit,
    transfer,
  };

  /** Rebuild the Equipment tab in place. */
  function renderEquipment() {
    equipmentHost.innerHTML = '';
    equipmentHost.appendChild(
      current
        ? buildEquipment(liveCharacter, (next) => commit(next, undefined, 'equipment'), canPlay())
        : emptyState('No character selected.'),
    );
  }

  /**
   * The Inventory tab: search/filter/sort controls over the item list, plus
   * the add form when playable. The controls re-fill only the list on input,
   * so typing in the search box never loses focus to a re-render.
   * @param {boolean} playable
   * @returns {HTMLElement}
   */
  function buildInventoryTab(playable) {
    const panel = document.createElement('div');

    const controls = document.createElement('div');
    controls.className = 'inventory-panel__controls';

    const searchInput = textField(searchQuery, 'Search items', {
      type: 'search',
      className: 'inventory-panel__search',
      ariaLabel: 'Search items by name or description',
    });

    const filterSelect = select([{ value: '', label: 'all types' }, ...ITEM_TYPES], typeFilter, {
      ariaLabel: 'Filter by item type',
    });

    const sortSelect = select(
      [
        { value: 'name', label: 'by name' },
        { value: 'type', label: 'by type' },
        { value: 'quantity', label: 'by quantity' },
      ],
      sortKey,
      { ariaLabel: 'Sort items' },
    );

    controls.append(searchInput, filterSelect, sortSelect);
    panel.appendChild(controls);

    const list = document.createElement('div');
    list.className = 'inventory-panel__list';
    // Reads the character afresh on every call rather than closing over the one
    // the tab was built for, so a consume or a give can refill the list without
    // rebuilding the controls above it.
    const fillList = () => {
      const character = current;
      list.innerHTML = '';
      if (!character) return;
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
      for (const item of visible) list.appendChild(buildRow(item, playable, rowContext));
    };
    refillList = fillList;
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
            const character = current;
            if (!character) return;
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
    const playable = canPlay();
    shown = { character: current, playable, editable: canEdit() };
    renderEquipment();
    refillList = null;
    inventoryHost.innerHTML = '';
    inventoryHost.appendChild(
      current ? buildInventoryTab(playable) : emptyState('No character selected.'),
    );
  }

  render();
  return {
    getCharacter: () => current,
    /** Sync in an externally-updated character (e.g. from a sibling panel) and
     * re-render, unless nothing this panel draws changed. The sibling panels
     * commit on every HP tick and spell slot, and each commit reaches every
     * panel; the kit is only part of what they hand over, and the entity layer
     * replaces rather than mutates, so an unchanged reference is an unchanged
     * list. */
    setCharacter: (next) => {
      const prev = current;
      current = next;
      if (
        prev &&
        next &&
        prev === shown.character &&
        prev.id === next.id &&
        prev.inventory === next.inventory &&
        prev.equipment === next.equipment &&
        shown.playable === canPlay() &&
        shown.editable === canEdit()
      ) {
        shown = { ...shown, character: next };
        return;
      }
      render();
    },
  };
}
