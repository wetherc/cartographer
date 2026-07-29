import { removeItem, updateItem } from '../entities/Character.js';
import { itemType, itemEffects } from '../entities/Equipment.js';
import { buildItemForm } from './ItemForm.js';
import { el } from './dom.js';
import { iconButton, textButton } from './buttons.js';
import { numberField, select } from './formFields.js';
import { confirmModal } from './Modal.js';
import { clampInt } from '../util/num.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/entities.js').InventoryItem} InventoryItem */
/** @typedef {import('../entities/InventoryLog.js').InventoryEvent} InventoryEvent */

/**
 * The per-item rows of the inventory panel's Inventory tab — the row itself,
 * its inline edit form, and the give form — split out of InventoryPanel.js,
 * which keeps the mount and render plumbing; the Equipment tab lives in
 * InventoryEquipment.js.
 *
 * The panel's per-mount view state (which row is being edited or given away)
 * and its commit/render plumbing arrive through a context object, so these
 * builders stay stateless while the state keeps living in the mount.
 *
 * `getCharacter` is a getter rather than a value because a row outlives changes
 * made elsewhere on the sheet: the panel leaves the list standing when a sibling
 * panel commits something the rows do not show, so a consume or a give has to
 * write against the character as it is when the button is pressed.
 *
 * @typedef {{
 *   view: { editingId: string | null, givingId: string | null },
 *   getCharacter: () => Character,
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
 * @param {InventoryItem} item
 * @param {boolean} playable
 * @param {RowContext} ctx
 * @returns {HTMLElement}
 */
export function buildRow(item, playable, ctx) {
  const { view, getCharacter, commit, render, canEdit, transfer } = ctx;
  if (item.id === view.editingId) {
    return el(
      'div',
      'inventory-panel__editor',
      buildItemForm({
        item,
        submitLabel: `Save ${item.name}`,
        onSubmit: (fields) => {
          view.editingId = null;
          commit(updateItem(getCharacter(), item.id, { ...fields, id: item.id }));
        },
        onCancel: () => {
          view.editingId = null;
          render();
        },
      }),
    );
  }

  const effects = itemEffects(item);
  const main = el(
    'div',
    'inventory-panel__item',
    el(
      'div',
      'u-row u-g2',
      el('span', 'inventory-panel__label', `${item.name} x${item.quantity}`),
      el('span', 'u-muted', itemType(item)),
    ),
    // One badge per effect, so a modifier-heavy item (damage riders, stat
    // bonuses, inflicted statuses) wraps into pills instead of one long line.
    effects.length > 0 &&
      el(
        'div',
        'inventory-panel__effects',
        ...effects.map((effect) => el('span', 'chip inventory-panel__effect', effect)),
      ),
    item.description ? el('div', 'inventory-panel__description u-muted', item.description) : null,
  );

  const row = el('div', 'inventory-panel__row u-row u-g2', main);

  if (!playable) return row;

  if (canEdit()) {
    row.appendChild(
      iconButton('edit', `Edit ${item.name}`, () => {
        view.editingId = item.id;
        view.givingId = null;
        render();
      }),
    );
  }

  // Hand-off to another party member; only offered when someone else exists
  // to receive. The give form opens inline under the row.
  const recipients = transfer
    ? transfer.recipients().filter((r) => r.id !== getCharacter().id)
    : [];
  if (recipients.length > 0) {
    row.appendChild(
      iconButton('give', `Give ${item.name} to another character`, () => {
        view.givingId = view.givingId === item.id ? null : item.id;
        view.editingId = null;
        render();
      }),
    );
  }

  // Present even on 1-stacks: consuming the last of an item and discarding
  // it are the same state change but different travelogue lines.
  const consumeButton = iconButton('minus', `Consume one ${item.name}`, () =>
    commit(removeItem(getCharacter(), item.id, 1), { verb: 'use', itemName: item.name, count: 1 }),
  );
  row.appendChild(consumeButton);

  const removeButton = iconButton(
    'remove',
    `Remove all ${item.name}`,
    async () => {
      // Discarding one item is as recoverable as consuming it; a multi-stack
      // discard destroys state the GM cannot rebuild with one click, so it
      // gets the same confirm treatment as every other destructive action.
      if (item.quantity > 1) {
        const ok = await confirmModal(`Discard all ${item.quantity} ${item.name}?`, {
          danger: true,
          confirmLabel: 'Discard',
        });
        if (!ok) return;
      }
      commit(removeItem(getCharacter(), item.id, item.quantity), {
        verb: 'discard',
        itemName: item.name,
        count: item.quantity,
      });
    },
    { variant: 'danger' },
  );
  row.appendChild(removeButton);
  if (item.id !== view.givingId || recipients.length === 0) return row;

  return el('div', '', row, buildGiveForm(item, recipients, ctx));
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
  const recipientSelect = select(
    recipients.map(({ id, name }) => ({ value: id, label: name })),
    recipients[0]?.id ?? '',
    { ariaLabel: `Give ${item.name} to` },
  );

  const countInput = numberField(1, {
    min: 1,
    max: item.quantity,
    className: 'inventory-panel__give-count',
    ariaLabel: `How many ${item.name} to give`,
  });
  // A 1-stack has nothing to choose; skip the input and give the one.
  countInput.hidden = item.quantity === 1;

  const giveButton = textButton('Give', () => {
    const count = clampInt(countInput.value, 1, item.quantity);
    view.givingId = null;
    transfer?.send(item, count, recipientSelect.value);
  });

  const cancelButton = textButton('Cancel', () => {
    view.givingId = null;
    render();
  });

  // Dismiss-left, affirmative-right — the same ordering as every modal.
  return el(
    'div',
    'inventory-panel__give u-row u-g1',
    recipientSelect,
    countInput,
    cancelButton,
    giveButton,
  );
}
