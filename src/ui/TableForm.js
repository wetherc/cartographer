import { el } from './dom.js';
import { iconButton, textButton } from './buttons.js';
import { buildInlineForm, numberField, textField } from './formFields.js';
import { MAX_WEIGHT, normalizeTable, rowChance } from '../dice/RandomTable.js';

/** @typedef {import('../types/table.js').RandomTable} RandomTable */

/**
 * The random table create and edit form, inline in the Library rail. Each
 * row line has a weight, the row text, the chance that the weight gives, and
 * a remove button. The chances update as the GM types, so the GM sees how
 * often each row comes up before saving. A submit with no row that has text
 * shows a message and stays open.
 * @param {{
 *   table: RandomTable | null,
 *   submitLabel: string,
 *   onSubmit: (table: RandomTable) => void,
 *   onCancel: () => void,
 * }} opts
 * @returns {HTMLDivElement}
 */
export function buildTableForm({ table, submitLabel, onSubmit, onCancel }) {
  const nameInput = textField(table?.name ?? '', { placeholder: 'Table name' });
  const list = el('ol', 'table-form__rows');
  /** @type {{ weight: HTMLInputElement, text: HTMLInputElement, chance: HTMLElement }[]} */
  let lines = [];

  /** The rows as typed, before normalizeTable cleans them. */
  const typedRows = () =>
    lines.map((line) => ({ weight: Number(line.weight.value) || 0, text: line.text.value }));

  /** Rewrite the chance of every line and the accessible names, which hold the row number. */
  const sync = () => {
    const rows = typedRows().map((row) => ({ ...row, weight: row.text.trim() ? row.weight : 0 }));
    lines.forEach((line, i) => {
      line.chance.textContent = `${rowChance({ rows }, i)}%`;
      line.weight.setAttribute('aria-label', `Weight of row ${i + 1}`);
      line.text.setAttribute('aria-label', `Text of row ${i + 1}`);
    });
  };

  /** Append one row line. @param {{ weight: number, text: string }} row */
  const addLine = (row) => {
    const weight = numberField(row.weight, { min: 1, max: MAX_WEIGHT, className: 'form__number' });
    const text = textField(row.text, { placeholder: 'What happens', className: 'form__wide' });
    const chance = el('span', 'table-form__chance u-muted');
    const item = el('li', 'table-form__row', weight, text, chance);
    const line = { weight, text, chance };
    item.appendChild(
      iconButton('remove', 'Remove row', () => {
        lines = lines.filter((l) => l !== line);
        item.remove();
        sync();
        (lines[lines.length - 1]?.text ?? addButton).focus();
      }),
    );
    weight.addEventListener('input', sync);
    text.addEventListener('input', sync);
    lines.push(line);
    list.appendChild(item);
  };

  const addButton = textButton(
    'Add row',
    () => {
      addLine({ weight: 1, text: '' });
      sync();
      lines[lines.length - 1].text.focus();
    },
    { icon: 'plus', className: 'table-form__add' },
  );

  for (const row of table?.rows ?? [{ weight: 1, text: '' }]) addLine(row);
  sync();

  const error = el('p', 'table-form__error');
  error.setAttribute('role', 'alert');
  const hint = el(
    'p',
    'table-form__hint u-muted',
    'A row with weight 2 comes up twice as often as a row with weight 1. Write {place} for a generated place name.',
  );
  const head = el(
    'div',
    'table-form__head u-muted',
    el('span', '', 'Weight'),
    el('span', '', 'Row'),
    el('span', '', 'Chance'),
  );

  return buildInlineForm({
    nameInput,
    nameLabel: 'Name',
    rows: [hint, head, list, addButton, error],
    submitLabel,
    onCancel,
    onSubmit,
    assemble: () => {
      const clean = normalizeTable({ name: nameInput.value, rows: typedRows() });
      error.textContent = clean ? '' : 'Add at least one row with text.';
      return clean;
    },
  });
}
