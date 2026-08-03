/**
 * The inline renderer for a modal field spec. An entity that the GM can
 * author in two places, a campaign encounter in a dialog and a bestiary
 * template in the Library rail, describes its fields once as a `ModalField[]`.
 * `promptModal` renders that list as a dialog. This module renders the same
 * list as an inline rail form, and hands the form's `onChange` the same
 * `ModalFormHandle` the dialog hands it, so a rule such as "re-stamp the
 * default stats when the tier changes" is written once and runs in both.
 *
 * The controls come from `formFields.js` and `ModalFields.js`, the same
 * builders the dialog uses, so a field looks and behaves alike on both
 * surfaces.
 */

import {
  buildInlineForm,
  checkbox,
  fieldRow,
  labeled,
  numberField,
  select,
  setOptions,
  textareaField,
  textField,
} from './formFields.js';
import { buildMultiselect } from './ModalFields.js';

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
 *   input: HTMLElement,
 *   get: () => string,
 *   set: (value: string) => void,
 *   setOptions?: (options: FieldOption[]) => void,
 * }} RenderedField
 */

/**
 * Cast a control that is not an `<input>` to the element type the shared
 * accessors are typed against. The composite fields and the textarea keep
 * their own value, read through `get`, so the cast is only about holding one
 * element per field.
 * @param {HTMLElement} element
 * @returns {HTMLInputElement}
 */
function asInput(element) {
  return /** @type {HTMLInputElement} */ (/** @type {unknown} */ (element));
}

/**
 * Build one field's control and its captioned wrapper.
 * @param {ModalField} field
 * @returns {RenderedField}
 */
function renderField(field) {
  if (field.type === 'select') {
    const picker = select(field.options, String(field.value ?? field.options[0]?.value ?? ''));
    return {
      node: labeled(field.label, picker),
      input: picker,
      get: () => picker.value,
      set: (value) => {
        picker.value = value;
      },
      setOptions: (options) => setOptions(picker, options, picker.value),
    };
  }
  if (field.type === 'checkbox') {
    // The box sits before its caption on one line, so `checkbox` owns the
    // wrapper here instead of `labeled`.
    const { label, input } = checkbox(field.label, !!field.value);
    return {
      node: label,
      input,
      get: () => (input.checked ? '1' : ''),
      set: (value) => {
        input.checked = !!value && value !== '0';
      },
    };
  }
  if (field.type === 'multiselect') {
    // The picker keeps its dialog classes, which is what gives it the
    // fixed-height scroll box in the rail too.
    const composite = buildMultiselect(field);
    return {
      node: labeled(field.label, composite.element),
      input: composite.element,
      get: composite.get,
      set: composite.set,
      setOptions: composite.setOptions,
    };
  }
  if (field.type === 'textarea') {
    const area = textareaField(field.value === undefined ? '' : String(field.value), {
      rows: field.rows,
      placeholder: field.placeholder,
    });
    return {
      node: labeled(field.label, area),
      input: area,
      get: () => area.value,
      set: (value) => {
        area.value = value;
      },
    };
  }
  if (field.type === 'number' || field.type === 'text' || field.type === undefined) {
    const input =
      field.type === 'number'
        ? numberField(field.value ?? '', {
            min: field.min,
            max: field.max,
            placeholder: field.placeholder,
          })
        : textField(field.value === undefined ? '' : String(field.value), {
            placeholder: field.placeholder,
          });
    return {
      node: labeled(field.label, input),
      input,
      get: () => input.value,
      set: (value) => {
        input.value = value;
      },
    };
  }
  // The file, tags, pill-grid, allocation, and button fields belong to
  // character creation and the item dialogs, none of which has a rail form.
  // A spec that reaches here needs a renderer written for that kind, not a
  // silently dropped field.
  throw new Error(`No inline renderer for the "${field.type}" field kind`);
}

/**
 * Build an inline rail form from a modal field spec. The first field is the
 * entity's name: it becomes the form's wide name input, and a blank name
 * refuses the submit, as in every other rail form. The rest lay out two per
 * row, with a `full` field taking a row of its own and a `newRow` field
 * beginning one.
 *
 * `assemble` receives the same field-name-to-string record that `promptModal`
 * resolves to, so both surfaces read a form back through the same functions.
 * `onChange` receives the changed field's name and a handle on the whole
 * form, matching the dialog's `onChange`. The handle's `setTotal` does
 * nothing, because an allocation field has no inline renderer.
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
    if (field.disabled) asInput(built.input).disabled = true;
    if (field.hidden) built.node.hidden = true;
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

  if (onChange) {
    /** @type {ModalFormHandle} */
    const handle = {
      get: (field) => rendered[field].get(),
      set: (field, value) => rendered[field].set(String(value)),
      setOptions: (field, options) => rendered[field].setOptions?.(options),
      setDisabled: (field, disabled) => {
        asInput(rendered[field].input).disabled = disabled;
      },
      setLabel: (field, text) => {
        const caption = rendered[field].node.querySelector('span');
        if (caption) caption.textContent = text;
      },
      setRange: (field, min, max) => {
        const input = asInput(rendered[field].input);
        input.min = min === undefined ? '' : String(min);
        input.max = max === undefined ? '' : String(max);
      },
      setHidden: (field, hidden) => {
        rendered[field].node.hidden = hidden;
      },
      setTotal: () => {},
    };
    for (const [field, built] of Object.entries(rendered)) {
      built.input.addEventListener('input', () => onChange(field, handle));
    }
  }

  const values = () =>
    Object.fromEntries(Object.entries(rendered).map(([field, built]) => [field, built.get()]));

  return buildInlineForm({
    nameInput: asInput(name.input),
    rows,
    assemble: () => assemble(values()),
    submitLabel,
    onSubmit,
    onCancel,
    className,
  });
}
