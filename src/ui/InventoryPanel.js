import { addItem, removeItem } from '../entities/Character.js';
import { wireDisclosure } from './Disclosure.js';
import { icon } from './icons.js';

/** @typedef {import('../types/entities.js').Character} Character */

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
 * Mount an inventory panel for the currently selected character, collapsed by
 * default to a one-line item count behind an accessible disclosure button.
 * Expanded, it lists items with a consume-one control (stacks of 2+) and a
 * remove-whole-stack button, plus a small form to add new items (or add
 * quantity to an existing one, keyed by name).
 * Renders an empty state when no character is selected (`null`).
 * @param {HTMLElement} container
 * @param {Character | null} character
 * @param {(character: Character) => void} [onChange]
 * @returns {{ getCharacter: () => Character | null, setCharacter: (character: Character | null) => void }}
 */
export function mountInventoryPanel(container, character, onChange = () => {}) {
  let current = character;
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

    const list = document.createElement('div');
    list.className = 'inventory-panel__list';
    for (const item of character.inventory) {
      const row = document.createElement('div');
      row.className = 'inventory-panel__row';

      const label = document.createElement('span');
      label.className = 'inventory-panel__label';
      label.textContent = `${item.name} x${item.quantity}`;

      row.appendChild(label);

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

    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.className = 'btn btn--primary';
    addButton.setAttribute('aria-label', 'Add item');
    addButton.appendChild(icon('add'));
    addButton.addEventListener('click', () => {
      const name = nameInput.value.trim();
      const quantity = Number(quantityInput.value);
      if (!name || quantity <= 0) return;
      commit(addItem(character, { id: idFromName(name), name, quantity, notes: '' }));
      nameInput.value = '';
      quantityInput.value = '1';
    });

    form.append(nameInput, quantityInput, addButton);
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
