/**
 * Shared building blocks for the inline Library-rail authoring forms. The item,
 * spell, bestiary, and NPC-template editors all render inline in the rail (not
 * in a modal) and want the same captioned controls, row grouping, and
 * action-button pair; these are the primitives they build from, so the DOM
 * shape and class vocabulary stay identical across every form.
 */

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
  for (const opt of options) {
    const { value: v, label } = typeof opt === 'string' ? { value: opt, label: opt } : opt;
    const option = document.createElement('option');
    option.value = v;
    option.textContent = label;
    el.appendChild(option);
  }
  el.value = value;
  return el;
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
      statInputs.map(({ key, input }) => [key, Math.max(1, Number(input.value) || 10)]),
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
 * The submit/cancel action row shared by every inline form: a primary submit
 * button plus an optional cancel, both text-labelled and same-sized. `onSubmit`
 * is the click handler (the caller owns validation and assembly); `onCancel`,
 * when given, adds the cancel button.
 * @param {{ submitLabel: string, onSubmit: () => void, onCancel?: (() => void) | null }} opts
 * @returns {HTMLDivElement}
 */
export function formActions({ submitLabel, onSubmit, onCancel = null }) {
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
