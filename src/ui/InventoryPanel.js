import { addItem, removeItem } from '../entities/Character.js';

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
 * Mount an inventory panel: a list of items with quantity and a remove
 * button, plus a small form to add new items (or add quantity to an
 * existing one, keyed by name).
 * @param {HTMLElement} container
 * @param {Character} character
 * @param {(character: Character) => void} [onChange]
 * @returns {{ getCharacter: () => Character }}
 */
export function mountInventoryPanel(container, character, onChange = () => {}) {
  let current = character;

  const root = document.createElement('div');
  root.className = 'inventory-panel';
  container.appendChild(root);

  function commit(next) {
    current = next;
    onChange(current);
    render();
  }

  function render() {
    root.innerHTML = '';

    const list = document.createElement('div');
    list.className = 'inventory-panel__list';
    for (const item of current.inventory) {
      const row = document.createElement('div');
      row.className = 'inventory-panel__row';

      const label = document.createElement('span');
      label.className = 'inventory-panel__label';
      label.textContent = `${item.name} x${item.quantity}`;

      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.textContent = '-';
      removeButton.addEventListener('click', () => commit(removeItem(current, item.id, 1)));

      row.append(label, removeButton);
      list.appendChild(row);
    }
    root.appendChild(list);

    const form = document.createElement('div');
    form.className = 'inventory-panel__form';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.placeholder = 'Item name';
    nameInput.className = 'inventory-panel__name-input';

    const quantityInput = document.createElement('input');
    quantityInput.type = 'number';
    quantityInput.value = '1';
    quantityInput.min = '1';
    quantityInput.className = 'inventory-panel__quantity-input';

    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.textContent = 'Add item';
    addButton.addEventListener('click', () => {
      const name = nameInput.value.trim();
      const quantity = Number(quantityInput.value);
      if (!name || quantity <= 0) return;
      commit(addItem(current, { id: idFromName(name), name, quantity, notes: '' }));
      nameInput.value = '';
      quantityInput.value = '1';
    });

    form.append(nameInput, quantityInput, addButton);
    root.appendChild(form);
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
