import { removeItem, updateItem } from '../entities/Character.js';
import { itemType, itemEffects } from '../entities/Equipment.js';
import { buildItemForm } from './ItemForm.js';
import { icon } from './icons.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/entities.js').InventoryItem} InventoryItem */
/** @typedef {import('../entities/InventoryLog.js').InventoryEvent} InventoryEvent */

/**
 * The per-item rows of the inventory panel's Inventory tab — the row itself,
 * its inline edit form, and the give form — split out of InventoryPanel.js,
 * which keeps the mount, tabs, and disclosure shell; the Equipment tab lives
 * in InventoryEquipment.js.
 *
 * The panel's per-mount view state (which row is being edited or given away)
 * and its commit/render plumbing arrive through a context object, so these
 * builders stay stateless while the state keeps living in the mount.
 *
 * @typedef {{
 *   view: { editingId: string | null, givingId: string | null },
 *   commit: (next: Character, event?: InventoryEvent) => void,
 *   render: () => void,
 *   canEdit: () => boolean,
 *   transfer?: { recipients: () => { id: string, name: string }[],
 *     send: (item: InventoryItem, count: number, recipientId: string) => void },
 * }} RowContext
 */

/**
 * One inventory row: name, stack count, description, and the mechanical
 * summary — plus edit/consume/discard controls when playable. The open edit
 * form (shared with the add form) renders in the row's place.
 * @param {Character} character
 * @param {InventoryItem} item
 * @param {boolean} playable
 * @param {RowContext} ctx
 * @returns {HTMLElement}
 */
export function buildRow(character, item, playable, ctx) {
  const { view, commit, render, canEdit, transfer } = ctx;
  if (item.id === view.editingId) {
    const editor = document.createElement('div');
    editor.className = 'inventory-panel__editor';
    editor.appendChild(
      buildItemForm({
        item,
        submitLabel: `Save ${item.name}`,
        onSubmit: (fields) => {
          view.editingId = null;
          commit(updateItem(character, item.id, { ...fields, id: item.id }));
        },
        onCancel: () => {
          view.editingId = null;
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
  type.textContent = itemType(item);
  line.append(label, type);
  main.appendChild(line);

  // One badge per effect, so a modifier-heavy item (damage riders, stat
  // bonuses, inflicted statuses) wraps into pills instead of one long line.
  const effects = itemEffects(item);
  if (effects.length > 0) {
    const badges = document.createElement('div');
    badges.className = 'inventory-panel__effects';
    for (const effect of effects) {
      const badge = document.createElement('span');
      badge.className = 'inventory-panel__effect';
      badge.textContent = effect;
      badges.appendChild(badge);
    }
    main.appendChild(badges);
  }

  if (item.description) {
    const description = document.createElement('div');
    description.className = 'inventory-panel__description';
    description.textContent = item.description;
    main.appendChild(description);
  }
  row.appendChild(main);

  if (!playable) return row;

  if (canEdit()) {
    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'btn btn--icon';
    editButton.setAttribute('aria-label', `Edit ${item.name}`);
    editButton.appendChild(icon('edit'));
    editButton.addEventListener('click', () => {
      view.editingId = item.id;
      view.givingId = null;
      render();
    });
    row.appendChild(editButton);
  }

  // Hand-off to another party member; only offered when someone else exists
  // to receive. The give form opens inline under the row.
  const recipients = transfer ? transfer.recipients().filter((r) => r.id !== character.id) : [];
  if (recipients.length > 0) {
    const giveButton = document.createElement('button');
    giveButton.type = 'button';
    giveButton.className = 'btn btn--icon';
    giveButton.setAttribute('aria-label', `Give ${item.name} to another character`);
    giveButton.appendChild(icon('give'));
    giveButton.addEventListener('click', () => {
      view.givingId = view.givingId === item.id ? null : item.id;
      view.editingId = null;
      render();
    });
    row.appendChild(giveButton);
  }

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
  if (item.id !== view.givingId || recipients.length === 0) return row;

  const wrap = document.createElement('div');
  wrap.appendChild(row);
  wrap.appendChild(buildGiveForm(item, recipients, ctx));
  return wrap;
}

/**
 * The inline give form under a row: recipient picker, a count clamped to
 * the stack, and confirm/cancel. Confirming defers to `transfer.send` —
 * the caller updates both characters and syncs this panel back in.
 * @param {InventoryItem} item
 * @param {{ id: string, name: string }[]} recipients
 * @param {RowContext} ctx
 * @returns {HTMLElement}
 */
function buildGiveForm(item, recipients, { view, render, transfer }) {
  const form = document.createElement('div');
  form.className = 'inventory-panel__give';

  const recipientSelect = document.createElement('select');
  recipientSelect.className = 'field';
  recipientSelect.setAttribute('aria-label', `Give ${item.name} to`);
  for (const r of recipients) {
    const option = document.createElement('option');
    option.value = r.id;
    option.textContent = r.name;
    recipientSelect.appendChild(option);
  }

  const countInput = document.createElement('input');
  countInput.type = 'number';
  countInput.className = 'field inventory-panel__give-count';
  countInput.min = '1';
  countInput.max = String(item.quantity);
  countInput.value = '1';
  countInput.setAttribute('aria-label', `How many ${item.name} to give`);
  // A 1-stack has nothing to choose; skip the input and give the one.
  countInput.hidden = item.quantity === 1;

  const giveButton = document.createElement('button');
  giveButton.type = 'button';
  giveButton.className = 'btn';
  giveButton.textContent = 'Give';
  giveButton.addEventListener('click', () => {
    const count = Math.min(item.quantity, Math.max(1, Math.floor(Number(countInput.value)) || 1));
    view.givingId = null;
    transfer?.send(item, count, recipientSelect.value);
  });

  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.className = 'btn';
  cancelButton.textContent = 'Cancel';
  cancelButton.addEventListener('click', () => {
    view.givingId = null;
    render();
  });

  form.append(recipientSelect, countInput, giveButton, cancelButton);
  return form;
}
