import { addItem, removeItem } from '../entities/Character.js';
import { EQUIPMENT_SLOTS, ITEM_TYPES, itemType, equip, getEquipped } from '../entities/Equipment.js';
import { wireDisclosure } from './Disclosure.js';
import { icon } from './icons.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/entities.js').ItemType} ItemType */

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
 * Equipment slot rows: a labeled select per slot, its options drawn from the
 * character's inventory with the slot's suggested item types listed first.
 * No type enforcement — any item can go in any slot.
 * @param {Character} character
 * @param {(next: Character) => void} commit
 * @returns {HTMLElement}
 */
function buildEquipment(character, commit) {
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
    const ranked = [...character.inventory].sort((a, b) => {
      const rank = (/** @type {typeof a} */ i) => {
        const at = slot.suggests.indexOf(itemType(i));
        return at === -1 ? slot.suggests.length : at;
      };
      return rank(a) - rank(b) || a.name.localeCompare(b.name);
    });
    for (const item of ranked) {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = item.name;
      select.appendChild(option);
    }
    select.value = getEquipped(character, slot.key)?.id ?? '';
    select.addEventListener('change', () =>
      commit(equip(character, slot.key, select.value === '' ? null : select.value)),
    );

    row.append(label, select);
    section.appendChild(row);
  }
  return section;
}

/**
 * Mount an inventory panel for the currently selected character, collapsed by
 * default to a one-line item count behind an accessible disclosure button.
 * Expanded, it lists items with a consume-one control (stacks of 2+) and a
 * remove-whole-stack button, plus a small form to add new items (or add
 * quantity to an existing one, keyed by name).
 * Renders an empty state when no character is selected (`null`).
 * @param {HTMLElement} container
 * @param {Character | null} initial
 * @param {(character: Character) => void} [onChange]
 * @returns {{ getCharacter: () => Character | null, setCharacter: (character: Character | null) => void }}
 */
export function mountInventoryPanel(container, initial, onChange = () => {}) {
  let current = initial;
  // Survives re-renders (every edit re-renders) but stays per-mount, so the
  // panel doesn't snap shut after each item change.
  let expanded = false;

  const root = document.createElement('div');
  root.className = 'inventory-panel';
  container.appendChild(root);

  /** @param {Character} next */
  function commit(next) {
    current = next;
    onChange(next);
    render();
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

    body.appendChild(buildEquipment(character, commit));

    const list = document.createElement('div');
    list.className = 'inventory-panel__list';
    for (const item of character.inventory) {
      const row = document.createElement('div');
      row.className = 'inventory-panel__row';

      const label = document.createElement('span');
      label.className = 'inventory-panel__label';
      label.textContent = `${item.name} x${item.quantity}`;

      const type = document.createElement('span');
      type.className = 'inventory-panel__type';
      type.textContent = itemType(item);

      row.append(label, type);

      if (item.quantity > 1) {
        const consumeButton = document.createElement('button');
        consumeButton.type = 'button';
        consumeButton.className = 'btn btn--icon';
        consumeButton.setAttribute('aria-label', `Consume one ${item.name}`);
        consumeButton.appendChild(icon('minus'));
        consumeButton.addEventListener('click', () => commit(removeItem(character, item.id, 1)));
        row.appendChild(consumeButton);
      }

      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'btn btn--icon btn--danger';
      removeButton.setAttribute('aria-label', `Remove all ${item.name}`);
      removeButton.appendChild(icon('remove'));
      removeButton.addEventListener('click', () => commit(removeItem(character, item.id, item.quantity)));

      row.appendChild(removeButton);
      list.appendChild(row);
    }
    body.appendChild(list);

    const form = document.createElement('div');
    form.className = 'inventory-panel__form';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.placeholder = 'Item name';
    nameInput.className = 'field inventory-panel__name-input';

    const quantityInput = document.createElement('input');
    quantityInput.type = 'number';
    quantityInput.value = '1';
    quantityInput.min = '1';
    quantityInput.className = 'field inventory-panel__quantity-input';
    quantityInput.setAttribute('aria-label', 'Quantity to add');

    const typeSelect = document.createElement('select');
    typeSelect.className = 'field inventory-panel__type-select';
    typeSelect.setAttribute('aria-label', 'Item type');
    for (const t of ITEM_TYPES) {
      const option = document.createElement('option');
      option.value = t;
      option.textContent = t;
      typeSelect.appendChild(option);
    }

    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.className = 'btn btn--primary';
    addButton.setAttribute('aria-label', 'Add item');
    addButton.appendChild(icon('add'));
    addButton.addEventListener('click', () => {
      const name = nameInput.value.trim();
      const quantity = Number(quantityInput.value);
      if (!name || quantity <= 0) return;
      const type = /** @type {ItemType} */ (typeSelect.value);
      commit(addItem(character, { id: idFromName(name), name, quantity, notes: '', type }));
      nameInput.value = '';
      quantityInput.value = '1';
    });

    form.append(nameInput, typeSelect, quantityInput, addButton);
    body.appendChild(form);

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
