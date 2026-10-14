import { el } from './dom.js';
import { labeled, numberField } from './formFields.js';
import { COINS, formatPurse } from '../entities/Purse.js';

/** @typedef {import('../types/entities.js').Purse} Purse */

/**
 * The coin row of the inventory: one number field per coin, most valuable
 * first. Each field writes on change, so a typed count lands when the field
 * loses focus or the GM presses Enter. A read-only view shows the coins as
 * one line of text instead.
 * @param {Purse} purse
 * @param {{ editable: boolean, onChange: (next: Purse) => void }} opts
 * @returns {HTMLElement}
 */
export function buildPurseFields(purse, { editable, onChange }) {
  const heading = el('h4', 'purse-fields__heading', 'Coins');
  if (!editable) {
    return el('div', 'purse-fields', heading, el('p', 'purse-fields__text', formatPurse(purse)));
  }
  const inputs = COINS.map(({ key, label }) => {
    const input = numberField(purse[key], { min: 0, className: 'form__number' });
    input.step = '1';
    input.dataset.coin = key;
    input.addEventListener('change', () => {
      /** @type {Purse} */
      const next = { ...purse };
      for (const field of inputs) {
        next[/** @type {keyof Purse} */ (field.input.dataset.coin)] = Number(field.input.value);
      }
      onChange(next);
    });
    return { input, field: labeled(label, input) };
  });
  return el(
    'div',
    'purse-fields',
    heading,
    el('div', 'purse-fields__row', ...inputs.map((i) => i.field)),
  );
}
