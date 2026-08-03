import { addItem } from '../entities/Character.js';
import { ITEM_TYPES, filterItems, groupItemsByType } from '../entities/Equipment.js';
import { emptyState } from './buttons.js';
import { buildDisclosure } from './Disclosure.js';
import { el } from './dom.js';
import { select, textField } from './formFields.js';
import { buildItemForm } from './ItemForm.js';
import { buildEquipment } from './InventoryEquipment.js';
import { buildRow } from './InventoryRows.js';
import { capitalize, slugify } from '../util/text.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/entities.js').ItemType} ItemType */
/** @typedef {import('../types/entities.js').InventoryItem} InventoryItem */
/** @typedef {import('../entities/InventoryLog.js').InventoryEvent} InventoryEvent */

/**
 * Mount the character's kit across two separate host elements. Equipment
 * shows slot pickers for what a character wears and wields, built in
 * InventoryEquipment.js. Inventory shows a searchable, type-filterable
 * item list, grouped under collapsible type headings, with add, consume,
 * discard, and full post-creation editing through the shared item form.
 * The rows themselves are built in InventoryRows.js. The two hosts live
 * under separate top-level tabs, so the panel renders each into its own
 * element and owns neither the tab strip nor any collapse behavior. The
 * panel shows an empty state in both hosts when no character is selected
 * (`null`). Item interactions, add, consume, and discard, are reported
 * through `onEvent` with the acting character, so the caller can log them.
 * Equipment changes and edits commit silently.
 * @param {HTMLElement} equipmentHost the Equipment tab's panel element
 * @param {HTMLElement} inventoryHost the Inventory tab's panel element
 * @param {Character | null} initial
 * If `canPlay` returns false, the panel renders read-only. It shows no
 * equipment changes and no consume, remove, or edit controls, for a
 * spectator's or another player's view of this character.
 * If `transfer` is set, each row grows a give control: a picker for
 * another party member and a count. The panel hands the stack over
 * through `transfer.send`. The caller owns moving the items and
 * rerendering, since both characters change.
 * Item stats and what the party owns are GM-adjudicated. The add form and
 * the per-row edit form appear only when `canEdit` returns true, so a
 * player tab can use, give, and discard its items, but never write itself
 * a new one or rewrite what one does.
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
  // The search and filter choices survive a rerender but stay per-mount.
  // They persist while the GM works through the list.
  let searchQuery = '';
  /** @type {ItemType | ''} */
  let typeFilter = '';
  // This stores which type headings the GM has folded away. It stores the
  // collapsed set, not the expanded one, so a type shown for the first
  // time opens by default.
  /** @type {Set<ItemType>} */
  const collapsedTypes = new Set();
  /** This tracks which item's edit or give form is open. It is shared with the row builders. */
  const view = {
    /** @type {string | null} */ editingId: null,
    /** @type {string | null} */ givingId: null,
  };

  /** @type {(() => void) | null} Refill the mounted Inventory tab's item list. */
  let refillList = null;
  /** This records what the two hosts on screen were built for, so a sync
   * can tell whether anything this panel draws has changed. */
  let shown = { character: initial, playable: false, editable: false };

  /** Refresh the item list alone. Leave the search box, its focus, the
   * type filter, and the add form where they are. */
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
    // Equipping never changes a row, but adding or spending an item
    // changes what the slot pickers can offer. The narrow scope runs one
    // way for that reason.
    renderEquipment();
    if (scope === 'all') refreshList();
  }

  /** This is the character a row or a slot picker writes against, read
   * when the control is used, not when it was built. It runs only from a
   * control that exists, which means a character is selected. */
  const liveCharacter = () => /** @type {Character} */ (current);

  /** @type {import('./InventoryRows.js').RowContext} */
  // A row's own render() only opens or closes its edit or give form,
  // which lives inside the list.
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
   * One type heading and the rows under it. This is a disclosure whose
   * open state lives in `collapsedTypes`, so folding a heading away
   * survives the list refills that a consume or a give triggers.
   * @param {{ type: ItemType, items: InventoryItem[] }} group
   * @param {boolean} playable
   * @returns {HTMLElement}
   */
  function buildGroup(group, playable) {
    const label = capitalize(group.type);
    const rows = el('div', 'inventory-panel__group-rows');
    for (const item of group.items) rows.appendChild(buildRow(item, playable, rowContext));

    const { head } = buildDisclosure({
      label,
      headChildren: [el('span', 'u-muted', `(${group.items.length})`)],
      body: rows,
      expanded: !collapsedTypes.has(group.type),
      onToggle: (expanded) => {
        if (expanded) collapsedTypes.delete(group.type);
        else collapsedTypes.add(group.type);
      },
    });
    return el('div', 'inventory-panel__group', head, rows);
  }

  /**
   * The Inventory tab: the search box and type filter over the grouped
   * item list, plus the add form for a GM. The controls refill only the
   * list on input, so typing in the search box never loses focus to a
   * rerender.
   * @param {boolean} playable
   * @returns {HTMLElement}
   */
  function buildInventoryTab(playable) {
    const searchInput = textField(searchQuery, 'Search items', {
      type: 'search',
      className: 'inventory-panel__search',
      ariaLabel: 'Search items by name or description',
    });

    const filterSelect = select([{ value: '', label: 'all types' }, ...ITEM_TYPES], typeFilter, {
      ariaLabel: 'Filter by item type',
    });

    const controls = el('div', 'inventory-panel__controls', searchInput, filterSelect);

    const list = el('div', 'inventory-panel__list');
    // This reads the character afresh on every call, instead of closing
    // over the one the tab was built for. A consume or a give can refill
    // the list without rebuilding the controls above it.
    const fillList = () => {
      const character = current;
      list.innerHTML = '';
      if (!character) return;
      const visible = filterItems(character.inventory, { query: searchQuery, type: typeFilter });
      if (visible.length === 0) {
        list.appendChild(
          emptyState(character.inventory.length === 0 ? 'No items yet.' : 'No items match.'),
        );
        return;
      }
      for (const group of groupItemsByType(visible)) list.appendChild(buildGroup(group, playable));
    };
    refillList = fillList;
    fillList();

    const panel = el('div', '', controls, list);

    searchInput.addEventListener('input', () => {
      searchQuery = searchInput.value;
      fillList();
    });
    filterSelect.addEventListener('change', () => {
      typeFilter = /** @type {ItemType | ''} */ (filterSelect.value);
      fillList();
    });

    // Picking an item up is a GM ruling on what the party found, not
    // something a player writes for itself, so the add form follows
    // `canEdit`, not `canPlay`.
    if (canEdit()) {
      panel.appendChild(
        buildItemForm({
          submitLabel: 'Add item',
          onSubmit: (fields) => {
            const character = current;
            if (!character) return;
            // The id comes from the name, so adding the same item twice
            // stacks quantity onto the existing row instead of making a
            // duplicate. This is why the panel slugifies instead of calling
            // `slugId`: a roster id has to be unique, and a stack id has to
            // repeat. A name of punctuation alone slugifies to nothing, so
            // "item" stands in and keeps the row addressable.
            const id = slugify(fields.name) || 'item';
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
    /** Sync an externally updated character, for example from a sibling
     * panel, and rerender, unless nothing this panel draws changed. The
     * sibling panels commit on every HP tick and spell slot, and each
     * commit reaches every panel. The kit is only part of what they hand
     * over. The entity layer replaces rather than mutates, so an
     * unchanged reference means an unchanged list. */
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
