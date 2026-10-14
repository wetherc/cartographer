import { el } from './dom.js';
import { textButton } from './buttons.js';
import { fieldRow, labeled, numberField, select, setOptions } from './formFields.js';
import { formatCost } from '../entities/Purse.js';
import { capitalize } from '../util/text.js';

/** @typedef {import('../types/library.js').EquipmentTemplate} EquipmentTemplate */

/**
 * The Buy row of the inventory: a picker of the priced library entries, a
 * count, and a Buy button. `onBuy` does the purchase and returns an error
 * text when the purse is short, which the row shows under the controls.
 * With no priced entry in the library, the row says so instead.
 * @param {EquipmentTemplate[]} templates the priced entries, in display order
 * @param {(template: EquipmentTemplate, quantity: number) => string | null} onBuy
 * @param {string} [picked] the name of the entry to select first
| null} onBuy
 * @returns {HTMLElement}
 */
export function buildBuyRow(templates, onBuy, picked = '') {
  const heading = el('h4', 'buy-row__heading', 'Buy');
  if (templates.length === 0) {
    return el(
      'div',
      'buy-row',
      heading,
      el('p', 'buy-row__status u-muted', 'No library item has a price.'),
    );
  }
  const picker = select([], '', { className: 'buy-row__item' });
  setOptions(
    picker,
    templates.map((t, i) => ({
      value: String(i),
      label: `${t.name} (${formatCost(t.cost)})`,
      group: capitalize(t.type),
    })),
    String(
      Math.max(
        0,
        templates.findIndex((t) => t.name === picked),
      ),
    ),
  );
  const quantity = numberField(1, { min: 1, className: 'form__number' });
  quantity.step = '1';
  const status = el('p', 'buy-row__status');
  status.setAttribute('role', 'status');
  const buy = textButton('Buy', () => {
    const template = templates[Number(picker.value)];
    const error = onBuy(template, Number(quantity.value));
    status.textContent = error ?? '';
    status.classList.toggle('buy-row__status--error', !!error);
  });
  return el(
    'div',
    'buy-row',
    heading,
    fieldRow(labeled('Item', picker), labeled('Qty', quantity), buy),
    status,
  );
}
