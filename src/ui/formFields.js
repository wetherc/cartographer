/**
 * Shared building blocks for the inline Library-rail authoring forms. The item,
 * spell, bestiary, and NPC-template editors all render inline in the rail (not
 * in a modal) and want the same captioned controls, row grouping, and
 * action-button pair; these are the primitives they build from, so the DOM
 * shape and class vocabulary stay identical across every form. `buildInlineForm`
 * assembles those primitives into the wrapper, name field, and action row all
 * four forms share, leaving each form only its own fields to describe.
 */

import { clampInt } from '../util/num.js';

/**
 * A captioned wrapper so each control names itself.
 * @param {string} caption
 * @param {HTMLElement} control
 * @returns {HTMLLabelElement}
 */
export function labeled(caption, control) {
  const label = document.createElement('label');
  label.className = 'inventory-panel__field-label';
  const text = document.createElement('span');
  text.textContent = caption;
  label.append(text, control);
  return label;
}

/**
 * A horizontal grouping of related fields. Type-specific fields toggle in and
 * out per row, so appearing controls extend their own line instead of
 * reflowing the whole form.
 * @param {...HTMLElement} children
 * @returns {HTMLDivElement}
 */
export function fieldRow(...children) {
  const row = document.createElement('div');
  row.className = 'inventory-panel__form-row';
  row.append(...children);
  return row;
}

/**
 * A labeled checkbox returning its wrapper and the input.
 * @param {string} caption
 * @param {boolean} checked
 * @returns {{ label: HTMLLabelElement, input: HTMLInputElement }}
 */
export function checkbox(caption, checked) {
  const label = document.createElement('label');
  label.className = 'spell-form__check';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  const text = document.createElement('span');
  text.textContent = caption;
  label.append(input, text);
  return { label, input };
}

/**
 * A text input pre-filled and classed as a form field.
 * @param {string} value
 * @param {string} [placeholder]
 * @returns {HTMLInputElement}
 */
export function textField(value, placeholder = '') {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'field';
  input.value = value;
  input.placeholder = placeholder;
  return input;
}

/**
 * A number input pre-filled and classed as a form field.
 * @param {number} value
 * @param {{ min?: number }} [opts]
 * @returns {HTMLInputElement}
 */
export function numberField(value, { min } = {}) {
  const input = document.createElement('input');
  input.type = 'number';
  input.className = 'field';
  input.value = String(value);
  if (min !== undefined) input.min = String(min);
  return input;
}

/**
 * A multi-line text input pre-filled and classed as a form field.
 * @param {string} value
 * @param {{ placeholder?: string, rows?: number }} [opts]
 * @returns {HTMLTextAreaElement}
 */
export function textareaField(value, { placeholder = '', rows = 3 } = {}) {
  const area = document.createElement('textarea');
  area.className = 'field';
  area.rows = rows;
  area.placeholder = placeholder;
  area.value = value;
  return area;
}

/**
 * A <select> over the given options, pre-selected. Options are either bare
 * strings (value === label) or `{ value, label }` pairs, so the same helper
 * serves plain enum pickers and labelled choices (weapons, dispositions).
 * @param {(string | { value: string, label: string })[]} options
 * @param {string} value
 * @returns {HTMLSelectElement}
 */
export function select(options, value) {
  const el = document.createElement('select');
  el.className = 'field';
  setOptions(el, options, value);
  return el;
}

/**
 * Replace a `<select>`'s options and selection. Pickers whose choices depend on
 * another field (the item form's preset list follows the item type) refill
 * themselves through this, so options are built in one place.
 * @param {HTMLSelectElement} el
 * @param {(string | { value: string, label: string })[]} options
 * @param {string} value
 */
export function setOptions(el, options, value) {
  el.replaceChildren(
    ...options.map((opt) => {
      const { value: v, label } = typeof opt === 'string' ? { value: opt, label: opt } : opt;
      const option = document.createElement('option');
      option.value = v;
      option.textContent = label;
      return option;
    }),
  );
  el.value = value;
}

/**
 * The stat-block input group shared by the bestiary and NPC template forms:
 * one number field per key, laid out two per row so the block stays compact,
 * with the same clamped read-back the modal dialogs use. The caller keeps the
 * `statInputs` handles for change listeners (the bestiary form's re-stamping).
 * @param {string[]} keys
 * @param {Record<string, number>} stats
 * @returns {{
 *   statInputs: { key: string, input: HTMLInputElement }[],
 *   rows: HTMLDivElement[],
 *   read: () => Record<string, number>,
 * }}
 */
export function statInputRows(keys, stats) {
  const statInputs = keys.map((key) => ({ key, input: numberField(stats[key] ?? 10, { min: 1 }) }));
  const rows = [];
  for (let i = 0; i < statInputs.length; i += 2) {
    rows.push(fieldRow(...statInputs.slice(i, i + 2).map(({ key, input }) => labeled(key, input))));
  }
  const read = () =>
    Object.fromEntries(
      statInputs.map(({ key, input }) => [key, clampInt(input.value, 1, Infinity, 10)]),
    );
  return { statInputs, rows, read };
}

/**
 * A text-labelled button, so a form's submit and cancel actions share one size
 * and label scheme (no icon set has a non-destructive "cancel" glyph).
 * @param {string} label
 * @param {string} className
 * @returns {HTMLButtonElement}
 */
export function labeledButton(label, className) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  return button;
}

/**
 * The envelope every inline authoring form shares. `nameInput` goes first and
 * gets the wide name-input styling, `rows` follow in order, and the action row
 * closes the form. Submitting reads the form through `assemble`, which returns
 * the finished value or null to refuse the submit; `afterSubmit` runs on an
 * accepted submit, for a form that clears itself to accept another entry.
 * @template T
 * @param {{
 *   nameInput: HTMLInputElement,
 *   rows: HTMLElement[],
 *   assemble: () => T | null,
 *   submitLabel: string,
 *   onSubmit: (fields: T) => void,
 *   onCancel?: (() => void) | null,
 *   afterSubmit?: (() => void) | null,
 *   className?: string,
 * }} opts
 * @returns {HTMLDivElement}
 */
export function buildInlineForm({
  nameInput,
  rows,
  assemble,
  submitLabel,
  onSubmit,
  onCancel = null,
  afterSubmit = null,
  className = '',
}) {
  const form = document.createElement('div');
  form.className = className ? `inventory-panel__form ${className}` : 'inventory-panel__form';
  nameInput.classList.add('inventory-panel__name-input');

  const actions = formActions({
    submitLabel,
    onSubmit: () => {
      // A nameless entry is unusable in every rail list, so no form submits one.
      // Anything else a form needs to refuse it refuses by assembling to null.
      if (!nameInput.value.trim()) return;
      const fields = assemble();
      if (fields === null) return;
      onSubmit(fields);
      afterSubmit?.();
    },
    onCancel,
  });

  form.append(nameInput, ...rows, actions);
  return form;
}

/**
 * A form's action row: a primary submit button plus an optional cancel, both
 * text-labelled and same-sized. `buildInlineForm` owns the only call, so every
 * form's buttons are ordered and styled alike.
 * @param {{ submitLabel: string, onSubmit: () => void, onCancel?: (() => void) | null }} opts
 * @returns {HTMLDivElement}
 */
function formActions({ submitLabel, onSubmit, onCancel = null }) {
  const submit = labeledButton(submitLabel, 'btn btn--primary');
  submit.addEventListener('click', onSubmit);
  // Dismiss-left, primary-right — the same ordering as every modal.
  const row = fieldRow();
  if (onCancel) {
    const cancel = labeledButton('Cancel', 'btn');
    cancel.addEventListener('click', onCancel);
    row.appendChild(cancel);
  }
  row.appendChild(submit);
  return row;
}
