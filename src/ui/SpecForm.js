/**
 * The inline renderer for a modal field spec. An entity that the GM can
 * author in two places, a campaign encounter in a dialog and a bestiary
 * template in the Library rail, describes its fields once as a `ModalField[]`.
 * `promptModal` renders that list as a dialog. This module renders the same
 * list as an inline rail form, and hands the form's `onChange` the same
 * `ModalFormHandle` the dialog hands it, so a rule such as "re-stamp the
 * default stats when the tier changes" is written once and runs in both.
 *
 * The controls come from `FieldControl.buildFieldControl`, the same builder
 * the dialog uses, so a field looks and behaves alike on both surfaces.
 */

import { buildInlineForm, fieldRow, labeled } from './formFields.js';
import { buildFieldControl } from './FieldControl.js';
import { applyFieldRules, hasFieldRules } from '../view/FieldRules.js';
import { el } from './dom.js';
import { sectionLabel } from './buttons.js';

/** @typedef {import('../types/modal.js').ModalField} ModalField */
/** @typedef {import('../types/modal.js').ModalFormHandle} ModalFormHandle */
/** @typedef {import('../types/modal.js').FieldOption} FieldOption */

/**
 * One rendered field: the node that goes into the form, the element that
 * carries the field's edits, and the accessors the form handle routes
 * through. `setOptions` exists only for a field whose choices can be
 * refiltered.
 * @typedef {{
 *   node: HTMLElement,
 *   input: HTMLInputElement,
 *   get: () => string,
 *   set: (value: string) => void,
 *   setOptions?: (options: FieldOption[], max?: number) => void,
 *   setTotal?: (total: number) => void,
 * }} RenderedField
 */

/**
 * Build one field's control and its captioned wrapper. The control comes from
 * `buildFieldControl`, the builder the dialog uses too, so every field kind
 * renders on both surfaces.
 * @param {ModalField} field
 * @returns {RenderedField}
 */
function renderField(field) {
  const control = buildFieldControl(field);
  const { input, get, set } = control;
  /** @type {HTMLElement} */
  let node;
  if (control.layout === 'check') {
    // The box sits before its caption on one line, as in `checkbox`.
    node = el('label', 'field-check u-muted', input, el('span', '', field.label));
  } else {
    node = labeled(control.layout === 'button' ? '' : field.label, input);
    if (control.layout === 'note') {
      const caption = /** @type {HTMLElement} */ (node.querySelector('span'));
      caption.setAttribute('role', 'status');
      caption.className = 'modal__note';
    }
    if (control.extra) node.appendChild(control.extra);
  }
  return {
    node,
    input,
    get,
    set,
    ...(control.setOptions ? { setOptions: control.setOptions } : {}),
    ...(control.setTotal ? { setTotal: control.setTotal } : {}),
  };
}

/**
 * Build an inline rail form from a modal field spec. The first field is the
 * entity's name: it becomes the form's wide name input, and a blank name
 * refuses the submit, as in every other rail form. The rest lay out two per
 * row, with a `full` field taking a row of its own and a `newRow` field
 * beginning one. A field with `section`, the name field too, gets a heading
 * above it. The rail form has no disclosure, so an `advanced` field shows
 * open under its section heading.
 *
 * `assemble` receives the same field-name-to-string record that `promptModal`
 * resolves to, so both surfaces read a form back through the same functions.
 * `onChange` receives the changed field's name and a handle on the whole
 * form, matching the dialog's `onChange`.
 * @template T
 * @param {{
 *   fields: ModalField[],
 *   assemble: (values: Record<string, string>) => T | null,
 *   submitLabel: string,
 *   onSubmit: (fields: T) => void,
 *   onCancel?: (() => void) | null,
 *   onChange?: ((name: string, form: ModalFormHandle) => void) | null,
 *   className?: string,
 * }} opts
 * @returns {HTMLDivElement}
 */
export function buildSpecForm({
  fields,
  assemble,
  submitLabel,
  onSubmit,
  onCancel = null,
  onChange = null,
  className = '',
}) {
  /** @type {Record<string, RenderedField>} */
  const rendered = {};
  const [nameField, ...rest] = fields;
  const name = renderField(nameField);
  rendered[nameField.name] = name;

  /** @type {HTMLElement[]} */
  const rows = [];
  /** @type {HTMLElement[]} */
  let pending = [];
  const flush = () => {
    if (pending.length) rows.push(fieldRow(...pending));
    pending = [];
  };
  for (const field of rest) {
    const built = renderField(field);
    rendered[field.name] = built;
    if (field.hidden) built.node.hidden = true;
    if (field.section) {
      flush();
      rows.push(sectionHeading(field.section));
    }
    if (field.full) {
      flush();
      rows.push(built.node);
      continue;
    }
    if (field.newRow) flush();
    pending.push(built.node);
    if (pending.length === 2) flush();
  }
  flush();

  if (onChange || hasFieldRules(fields)) {
    /** @type {ModalFormHandle} */
    const handle = {
      get: (field) => rendered[field].get(),
      set: (field, value) => rendered[field].set(String(value)),
      setOptions: (field, options, max) => rendered[field].setOptions?.(options, max),
      setDisabled: (field, disabled) => {
        rendered[field].input.disabled = disabled;
      },
      setLabel: (field, text) => {
        const caption = rendered[field].node.querySelector('span');
        if (caption) caption.textContent = text;
      },
      setRange: (field, min, max) => {
        const input = rendered[field].input;
        input.min = min === undefined ? '' : String(min);
        input.max = max === undefined ? '' : String(max);
      },
      setHidden: (field, hidden) => {
        rendered[field].node.hidden = hidden;
      },
      setTotal: (field, total) => rendered[field].setTotal?.(total),
    };
    /** @param {string} field */
    const readRuled = (field) => rendered[field]?.get() ?? '';
    // The enabledWhen rules run first, the same as in the dialog.
    applyFieldRules(fields, null, readRuled, handle.setDisabled);
    for (const [field, built] of Object.entries(rendered)) {
      built.input.addEventListener('input', () => {
        applyFieldRules(fields, field, readRuled, handle.setDisabled);
        onChange?.(field, handle);
      });
    }
  }

  const values = () =>
    Object.fromEntries(Object.entries(rendered).map(([field, built]) => [field, built.get()]));

  const form = buildInlineForm({
    nameInput: name.input,
    rows,
    assemble: () => assemble(values()),
    submitLabel,
    onSubmit,
    onCancel,
    className,
  });
  if (nameField.section) form.prepend(sectionHeading(nameField.section));
  return form;
}

/**
 * A section heading of the rail form, the same heading the dialog uses.
 * @param {string} text
 */
function sectionHeading(text) {
  return sectionLabel(text, { tag: 'h3', className: 'modal__section' });
}
