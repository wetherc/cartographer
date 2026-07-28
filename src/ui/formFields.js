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
import { textButton } from './buttons.js';
import { classNames, el } from './dom.js';

/**
 * The options every builder here accepts on top of its own. `className` is
 * appended to the builder's base class rather than replacing it, so a caller
 * that wants one sizing or layout modifier still gets the shared `field`
 * presentation. `ariaLabel` covers the controls that stand alone in a toolbar
 * with no visible caption to name them.
 * @typedef {{ className?: string, ariaLabel?: string }} FieldOpts
 */

/**
 * Apply the shared options to a freshly built control.
 * @template {HTMLElement} T
 * @param {T} control
 * @param {FieldOpts} opts
 * @returns {T}
 */
function withOpts(control, { className, ariaLabel }) {
  if (className) control.className = classNames([control.className, className]);
  if (ariaLabel) control.setAttribute('aria-label', ariaLabel);
  return control;
}

/**
 * A captioned wrapper so each control names itself.
 * @param {string} caption
 * @param {HTMLElement} control
 * @param {FieldOpts} [opts]
 * @returns {HTMLLabelElement}
 */
export function labeled(caption, control, opts = {}) {
  const label = el(
    'label',
    'inventory-panel__field-label u-muted',
    el('span', '', caption),
    control,
  );
  return withOpts(label, opts);
}

/**
 * A horizontal grouping of related fields. Type-specific fields toggle in and
 * out per row, so appearing controls extend their own line instead of
 * reflowing the whole form. A caller needing a modifier class on the row builds
 * it with `el` instead; the variadic children are worth more here than an
 * options bag.
 * @param {...import('./dom.js').Child} children
 * @returns {HTMLDivElement}
 */
export function fieldRow(...children) {
  return el('div', 'inventory-panel__form-row', ...children);
}

/**
 * A labeled checkbox returning its wrapper and the input.
 * @param {string} caption
 * @param {boolean} checked
 * @param {FieldOpts} [opts]
 * @returns {{ label: HTMLLabelElement, input: HTMLInputElement }}
 */
export function checkbox(caption, checked, opts = {}) {
  const input = el('input');
  input.type = 'checkbox';
  input.checked = checked;
  const label = el('label', 'spell-form__check u-muted', input, el('span', '', caption));
  return { label: withOpts(label, opts), input };
}

/**
 * A text input pre-filled and classed as a form field. `type` covers the
 * search variant, which wants the browser's clear affordance.
 * @param {string} value
 * @param {string} [placeholder]
 * @param {FieldOpts & { type?: 'text' | 'search' }} [opts]
 * @returns {HTMLInputElement}
 */
export function textField(value, placeholder = '', opts = {}) {
  const input = el('input', 'field');
  input.type = opts.type ?? 'text';
  input.value = value;
  input.placeholder = placeholder;
  return withOpts(input, opts);
}

/**
 * A number input pre-filled and classed as a form field. An empty-string value
 * leaves the input blank, for an optional number whose placeholder stands in
 * for "unset".
 * @param {number | ''} value
 * @param {FieldOpts & { min?: number, max?: number, placeholder?: string }} [opts]
 * @returns {HTMLInputElement}
 */
export function numberField(value, opts = {}) {
  const input = el('input', 'field');
  input.type = 'number';
  input.value = String(value);
  if (opts.placeholder) input.placeholder = opts.placeholder;
  if (opts.min !== undefined) input.min = String(opts.min);
  if (opts.max !== undefined) input.max = String(opts.max);
  return withOpts(input, opts);
}

/**
 * A multi-line text input pre-filled and classed as a form field.
 * @param {string} value
 * @param {FieldOpts & { placeholder?: string, rows?: number }} [opts]
 * @returns {HTMLTextAreaElement}
 */
export function textareaField(value, opts = {}) {
  const area = el('textarea', 'field');
  area.rows = opts.rows ?? 3;
  if (opts.placeholder) area.placeholder = opts.placeholder;
  area.value = value;
  return withOpts(area, opts);
}

/**
 * A <select> over the given options, pre-selected. Options are either bare
 * strings (value === label) or `{ value, label }` pairs, so the same helper
 * serves plain enum pickers and labelled choices (weapons, dispositions). An
 * option may be marked `disabled` for a choice that is shown but unavailable
 * (a spell level the character cannot yet cast).
 * @param {(string | { value: string, label: string, disabled?: boolean })[]} options
 * @param {string} value
 * @param {FieldOpts} [opts]
 * @returns {HTMLSelectElement}
 */
export function select(options, value, opts = {}) {
  const picker = el('select', 'field');
  setOptions(picker, options, value);
  return withOpts(picker, opts);
}

/**
 * Replace a `<select>`'s options and selection. Pickers whose choices depend on
 * another field (the item form's preset list follows the item type) refill
 * themselves through this, so options are built in one place.
 * @param {HTMLSelectElement} picker
 * @param {(string | { value: string, label: string, disabled?: boolean })[]} options
 * @param {string} value
 */
export function setOptions(picker, options, value) {
  picker.replaceChildren(
    ...options.map((opt) => {
      const spec = typeof opt === 'string' ? { value: opt, label: opt } : opt;
      const option = el('option', '', spec.label);
      option.value = spec.value;
      if ('disabled' in spec && spec.disabled) option.disabled = true;
      return option;
    }),
  );
  picker.value = value;
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
  const form = el(
    'div',
    className ? `inventory-panel__form ${className}` : 'inventory-panel__form',
  );
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
 * text-labelled and same-sized (no icon set has a non-destructive "cancel"
 * glyph). `buildInlineForm` owns the only call, so every form's buttons are
 * ordered and styled alike.
 * @param {{ submitLabel: string, onSubmit: () => void, onCancel?: (() => void) | null }} opts
 * @returns {HTMLDivElement}
 */
function formActions({ submitLabel, onSubmit, onCancel = null }) {
  // Dismiss-left, primary-right, the same ordering as every modal.
  return fieldRow(
    onCancel && textButton('Cancel', onCancel),
    textButton(submitLabel, onSubmit, { variant: 'primary' }),
  );
}
