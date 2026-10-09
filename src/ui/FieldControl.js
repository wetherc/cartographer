/**
 * The control of one modal field spec, for every field kind. `promptModal`
 * renders a `ModalField[]` as a dialog and `SpecForm.buildSpecForm` renders
 * the same list as an inline rail form. Both build each field's control here,
 * so a field kind added to the spec renders on both surfaces, and the two
 * agree on the field class, the number clamp, and the value accessors. The
 * caller owns the caption and the wrapper.
 */

import { textButton } from './buttons.js';
import { el, uniqueId } from './dom.js';
import {
  checkboxInput,
  numberField,
  select,
  setOptions,
  textareaField,
  textField,
} from './formFields.js';
import { exhaustive } from '../util/exhaustive.js';
import { buildImagePickField } from './ImagePickField.js';
import { buildAllocation, buildMultiselect, buildPillGrid, buildTagsField } from './ModalFields.js';

/** @typedef {import('../types/modal.js').ModalField} ModalField */
/** @typedef {import('../types/modal.js').FieldOption} FieldOption */

/**
 * One field's control and its accessors. `layout` tells the caller how to
 * caption it: `check` puts the box and its caption on one line, `button`
 * names the button by its own text and needs no caption, and `note` makes
 * the caption itself the field (a polite live region). `extra` is an element
 * that goes after the control, such as the file field's error line.
 * `setOptions` exists for a select and a multiselect, and `setTotal` for an
 * allocation.
 * @typedef {{
 *   input: HTMLInputElement,
 *   get: () => string,
 *   set: (value: string) => void,
 *   setOptions?: (options: FieldOption[], max?: number) => void,
 *   setTotal?: (total: number) => void,
 *   extra?: HTMLElement,
 *   layout: 'plain' | 'check' | 'button' | 'note',
 * }} FieldControl
 */

/**
 * Cast a control that is not an `<input>` to the element type the shared
 * accessors are typed against. The composite fields keep their own value,
 * read through `get`, so the cast is only about holding one element per field.
 * @param {HTMLElement} element
 * @returns {HTMLInputElement}
 */
function asInput(element) {
  return /** @type {HTMLInputElement} */ (/** @type {unknown} */ (element));
}

/**
 * The accessors of a control whose value is its `value` property.
 * @param {HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement} input
 */
function valueOf(input) {
  return {
    get: () => input.value,
    set: (/** @type {string} */ value) => {
      input.value = value;
    },
  };
}

/**
 * Build the control of one field. `onRead` receives the decode of a picked
 * image, so a caller can wait for it before it collects the values.
 * @param {ModalField} field
 * @param {{ onRead?: (read: Promise<void>) => void }} [hooks]
 * @returns {FieldControl}
 */
export function buildFieldControl(field, hooks = {}) {
  const control = buildControl(field, hooks);
  if (field.disabled) control.input.disabled = true;
  return control;
}

/**
 * @param {ModalField} field
 * @param {{ onRead?: (read: Promise<void>) => void }} hooks
 * @returns {FieldControl}
 */
function buildControl(field, hooks) {
  switch (field.type) {
    case 'select': {
      const choices = field.options ?? [];
      // No stated value means the first option, which is what a bare
      // `<select>` shows.
      const picker = select(choices, String(field.value ?? choices[0]?.value ?? ''));
      return {
        input: asInput(picker),
        ...valueOf(picker),
        // A plain select keeps its choice while that choice is still offered,
        // and falls back to the first option otherwise.
        setOptions: (options) => {
          const kept = options.some((o) => o.value === picker.value);
          setOptions(picker, options, kept ? picker.value : (options[0]?.value ?? ''));
        },
        layout: 'plain',
      };
    }
    case 'checkbox': {
      const box = checkboxInput(!!field.value);
      return {
        input: box,
        get: () => (box.checked ? '1' : ''),
        set: (value) => {
          box.checked = !!value && value !== '0';
        },
        layout: 'check',
      };
    }
    case 'file': {
      // An existing image stays the value until a new pick replaces it.
      const pick = buildImagePickField(field, (read) => hooks.onRead?.(read));
      const input = asInput(pick.element);
      return { input, get: pick.get, set: () => {}, extra: pick.error, layout: 'plain' };
    }
    case 'multiselect':
    case 'tags':
    case 'pillgrid':
    case 'allocation': {
      // Each composite field owns its own state and rendering. The caller
      // holds only its handle.
      const composite =
        field.type === 'multiselect'
          ? buildMultiselect(field)
          : field.type === 'tags'
            ? buildTagsField(field)
            : field.type === 'allocation'
              ? buildAllocation(field)
              : buildPillGrid(field);
      return {
        input: asInput(composite.element),
        get: composite.get,
        set: composite.set,
        ...(composite.setOptions ? { setOptions: composite.setOptions } : {}),
        ...(composite.setTotal ? { setTotal: composite.setTotal } : {}),
        layout: 'plain',
      };
    }
    case 'button': {
      // This is an in-form action, for example "Reroll scores". A click fires
      // the form's onChange under the field's name and adds no value. The
      // listener reaches `button` at click time, after the binding settles.
      const button = textButton(field.label, () => button.dispatchEvent(new Event('input')));
      // A wrapping <label> with an empty caption names a labelled button by
      // that label in Chromium, so aria-label names it by its text.
      button.setAttribute('aria-label', field.label);
      return { input: asInput(button), get: () => '', set: () => {}, layout: 'button' };
    }
    case 'note':
      // A line of text that onChange rewrites through setLabel. It adds no input.
      return { input: asInput(el('span', '')), get: () => '', set: () => {}, layout: 'note' };
    case 'textarea': {
      // A prose field gets a box, rather than a one-line input that hides
      // most of what the GM typed.
      const area = textareaField(field.value === undefined ? '' : String(field.value), {
        rows: field.rows,
        placeholder: field.placeholder,
      });
      return { input: asInput(area), ...valueOf(area), layout: 'plain' };
    }
    case 'number':
    case 'search':
    case 'text':
    case undefined: {
      const plain =
        field.type === 'number'
          ? numberField(field.value ?? '', {
              min: field.min,
              max: field.max,
              placeholder: field.placeholder,
            })
          : textField(field.value === undefined ? '' : String(field.value), {
              placeholder: field.placeholder,
              type: field.type === 'search' ? 'search' : 'text',
            });
      // A search field narrows another field, and an Enter that submits from
      // it acts on a choice that the GM has not looked at yet.
      if (field.type === 'search')
        plain.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') event.preventDefault();
        });
      // Suggestions offer known values, such as item names for a lock key,
      // and still accept any text.
      if (field.type !== 'number' && field.suggestions?.length) {
        const list = el('datalist', '');
        list.id = uniqueId('modal-suggest');
        list.append(
          ...field.suggestions.map((value) => Object.assign(el('option', ''), { value })),
        );
        plain.setAttribute('list', list.id);
        return { input: plain, ...valueOf(plain), extra: list, layout: 'plain' };
      }
      return { input: plain, ...valueOf(plain), layout: 'plain' };
    }
    default: {
      // A field kind added to `ModalField` without a case here fails the
      // typecheck at this call.
      const kind = exhaustive(field, /** @type {any} */ (field).type);
      throw new Error(`No control for the "${kind}" field kind`);
    }
  }
}
