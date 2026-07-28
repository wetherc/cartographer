/**
 * Small helpers around the native <dialog> element, so features like "new node"
 * and "confirm delete" share one focus-managed, escape-closable modal instead
 * of hand-rolling overlay markup each time. Each call builds a dialog, appends
 * it to <body>, and removes it on close, resolving a Promise with the result.
 *
 * `openDialog` is the shared lifecycle underneath all of that, and the dialogs
 * that live in their own modules (the spell detail, combat setup, the generator,
 * the stat breakdown) build on it too, so focus restoration and dismissal
 * semantics have one owner.
 */

import { textButton } from './buttons.js';
import { classNames, el } from './dom.js';
import { select } from './formFields.js';
import { readImageFile } from './imageField.js';
import { buildAllocation, buildMultiselect, buildPillGrid, buildTagsField } from './ModalFields.js';
import { clamp } from '../util/num.js';

/** @typedef {import('../types/modal.js').ModalField} ModalField */
/** @typedef {import('../types/modal.js').ModalFormHandle} ModalFormHandle */
/** @typedef {import('../types/modal.js').FieldOption} FieldOption */
/** @typedef {import('../types/modal.js').CompositeField} CompositeField */

/**
 * What a dialog's builder hands back: the content between the title and the
 * button row, the buttons themselves, and which element takes focus once the
 * dialog opens.
 * @typedef {{
 *   body?: Node[],
 *   actions?: HTMLElement[],
 *   initialFocus?: HTMLElement | null,
 * }} DialogParts
 */

/**
 * Open a modal dialog and resolve once it closes. This owns the lifecycle every
 * dialog in the app needs and none of them should re-implement: remembering
 * which element opened it so keyboard users are not dropped at the top of the
 * document, appending to `<body>`, showing it modally, focusing the right
 * control, and on close removing the element, restoring focus, and resolving.
 * Escape-to-dismiss comes free with `<dialog>`.
 *
 * `build` receives a `close(value)` it wires into its own buttons, and returns
 * the parts to assemble. `result` turns the dialog's return value into whatever
 * the caller promised — it runs while the dialog is still in the document, so a
 * mapper may read its own inputs, and it may return a promise when the value is
 * not known until in-flight work settles (a file decode).
 *
 * With `form` the parts go inside a `<form method="dialog">`, which is what
 * makes Enter submit and a submit button's `value` become the return value.
 * @template T
 * @param {{
 *   className?: string,
 *   title?: string,
 *   form?: boolean,
 *   build: (close: (value?: string) => void) => DialogParts,
 *   result?: (returnValue: string) => T | Promise<T>,
 * }} spec
 * @returns {Promise<T>}
 */
export function openDialog(spec) {
  return new Promise((resolve) => {
    const opener = /** @type {HTMLElement | null} */ (document.activeElement);
    const dialog = el('dialog', spec.className ?? 'modal');

    /** @type {HTMLElement} */
    let host = dialog;
    if (spec.form) {
      const form = el('form', 'modal__form');
      form.method = 'dialog';
      dialog.appendChild(form);
      host = form;
    }

    if (spec.title) host.appendChild(el('h2', 'modal__title', spec.title));

    const parts = spec.build((value) => dialog.close(value));
    host.append(...(parts.body ?? []));
    if (parts.actions?.length) host.appendChild(el('div', 'modal__actions', ...parts.actions));
    document.body.appendChild(dialog);

    dialog.addEventListener('close', () => {
      /** @param {any} value */
      const finish = (value) => {
        dialog.remove();
        opener?.focus?.();
        resolve(value);
      };
      const result = spec.result ? spec.result(dialog.returnValue) : undefined;
      if (result instanceof Promise) result.then(finish);
      else finish(result);
    });

    dialog.showModal();
    parts.initialFocus?.focus();
  });
}

/**
 * The composite fields and the action button are not `<input>`s, but the form
 * keeps one element per field so it can attach the change listener, toggle
 * `disabled`, and focus the first field without asking what kind each one is.
 * This is the one place that says so.
 * @param {HTMLElement} element
 * @returns {HTMLInputElement}
 */
function asInput(element) {
  return /** @type {HTMLInputElement} */ (/** @type {unknown} */ (element));
}

/**
 * Show a form modal. Resolves to a record of field name -> string value on
 * submit, or null if cancelled/dismissed. With `wide` the form lays fields
 * out two per row (a field marked `full` spans both columns), for dialogs
 * with too many fields to read comfortably as one tall stack. `onChange`
 * fires on every edit with the changed field's name and a get/set handle on
 * the whole form, so one field can drive another (e.g. re-stamping default
 * stats when an enemy's tier changes).
 * @param {string} title
 * @param {ModalField[]} fields
 * @param {{
 *   submitLabel?: string,
 *   wide?: boolean,
 *   onChange?: (name: string, form: ModalFormHandle) => void,
 * }} [options]
 * @returns {Promise<Record<string, string> | null>}
 */
export function promptModal(title, fields, options = {}) {
  /** @type {Record<string, HTMLInputElement | HTMLSelectElement>} */
  const inputs = {};
  /** Value accessors per field — file inputs resolve to a data: URL rather
   * than the input's fakepath value. */
  /** @type {Record<string, () => string>} */
  const getters = {};
  /** In-flight reads per field, awaited before the submitted record is
   * collected. A file field's value is only known once its decode settles, and
   * collecting synchronously stored an empty value for a GM who submitted
   * quickly after picking. Deliberately kept separate from `getters` rather
   * than letting one getter return a promise: `onChange`'s `get(name)` handle
   * is read synchronously by five callers and must stay a string. */
  /** @type {Record<string, Promise<void>>} */
  const reads = {};
  /** Extra elements a field wants appended after its input (the file field's
   * inline error line). */
  /** @type {Record<string, HTMLElement>} */
  const extras = {};
  /** Option rebuilders per multiselect field, so onChange can refilter a
   * checkbox group in place (preserving what's checked). */
  /** @type {Record<string, (options: FieldOption[], max?: number) => void>} */
  const rebuilders = {};
  /** Total setters per allocation field, so onChange can restate how many there
   * are to distribute when another field decides that count. */
  /** @type {Record<string, (total: number) => void>} */
  const totals = {};
  /** Label text nodes per field, so onChange can restate a caption (e.g.
   * "Class skills (choose 2)"). */
  /** @type {Record<string, Text>} */
  const labelTexts = {};
  /** Value setters for the composite fields, whose state isn't an input.value;
   * plain fields fall through to the default assignment. */
  /** @type {Record<string, (value: string) => void>} */
  const setters = {};
  /** The whole field wrapper per name, so onChange can show/hide a field. */
  /** @type {Record<string, HTMLElement>} */
  const wrappers = {};

  return openDialog({
    className: options.wide ? 'modal modal--wide' : 'modal',
    title,
    form: true,
    build: (close) => {
      /** @type {Node[]} */
      const body = [];
      for (const field of fields) {
        const labelText = document.createTextNode(field.label);
        const label = el(
          'label',
          classNames([
            'modal__field u-muted',
            field.full && 'modal__field--full',
            field.hidden && 'modal__field--hidden',
          ]),
          labelText,
        );
        labelTexts[field.name] = labelText;
        wrappers[field.name] = label;

        /** @type {HTMLInputElement | HTMLSelectElement} */
        let input;
        if (field.type === 'select') {
          const choices = field.options ?? [];
          // No stated value means the first option, which is what a bare
          // `<select>` shows; naming it keeps `select`'s value argument honest.
          input = select(choices, String(field.value ?? choices[0]?.value ?? ''));
          getters[field.name] = () => input.value;
        } else if (field.type === 'file') {
          // A picked image is decoded, downscaled, and re-encoded under a size cap
          // by `readImageFile` before it becomes the field's value; leaving the
          // input untouched keeps the field's initial value (an existing image
          // survives an edit).
          input = el('input');
          input.type = 'file';
          input.accept = 'image/*';
          let dataUrl = field.value !== undefined ? String(field.value) : '';
          // A rejected pick reports inline rather than through `alertModal`: this
          // dialog is still open, and a second modal over it steals focus from the
          // form the GM is in the middle of.
          const error = el('p', 'modal__error');
          error.setAttribute('role', 'alert');
          error.hidden = true;
          input.addEventListener('change', () => {
            const picked = /** @type {HTMLInputElement} */ (input);
            const file = picked.files?.[0];
            if (!file) return;
            error.hidden = true;
            reads[field.name] = readImageFile(file).then(
              (url) => {
                dataUrl = url;
              },
              (/** @type {Error} */ failure) => {
                // Clear the selection so re-picking the same file fires `change`
                // again — a file input is silent when the pick matches its current
                // value, which would make the obvious retry do nothing.
                picked.value = '';
                error.textContent = failure.message;
                error.hidden = false;
              },
            );
          });
          getters[field.name] = () => dataUrl;
          extras[field.name] = error;
        } else if (
          field.type === 'multiselect' ||
          field.type === 'tags' ||
          field.type === 'pillgrid' ||
          field.type === 'allocation'
        ) {
          // The composite fields own their own state and rendering, so the
          // dialog only holds their handle: one element to mount, one reader for
          // the submitted record, one writer for `onChange`'s `set`. A
          // multiselect adds the refilter `setOptions` routes to.
          const composite =
            field.type === 'multiselect'
              ? buildMultiselect(field)
              : field.type === 'tags'
                ? buildTagsField(field)
                : field.type === 'allocation'
                  ? buildAllocation(field)
                  : buildPillGrid(field);
          input = asInput(composite.element);
          getters[field.name] = composite.get;
          setters[field.name] = composite.set;
          if (composite.setOptions) rebuilders[field.name] = composite.setOptions;
          if (composite.setTotal) totals[field.name] = composite.setTotal;
        } else if (field.type === 'button') {
          // An in-form action (e.g. "Reroll scores"): clicking it fires the
          // form's onChange under the field's name; it contributes no value to
          // the submitted record. The field's label sits on the button itself.
          // The listener reaches `button` at click time, after the binding settles.
          const button = textButton(field.label, () => button.dispatchEvent(new Event('input')));
          labelText.nodeValue = '';
          input = asInput(button);
          getters[field.name] = () => '';
        } else {
          const plain = el('input');
          plain.type = field.type ?? 'text';
          if (field.value !== undefined) plain.value = String(field.value);
          if (field.min !== undefined) plain.min = String(field.min);
          if (field.max !== undefined && field.type === 'number') plain.max = String(field.max);
          // min/max only constrain the spinner; a typed out-of-range number is
          // clamped once the edit commits (blur/Enter), not per keystroke, so a
          // "1" on the way to "12" isn't rewritten under the user.
          if (field.type === 'number') {
            plain.addEventListener('change', () => {
              const value = Number(plain.value);
              if (plain.value === '' || Number.isNaN(value)) return;
              const min = plain.min === '' ? -Infinity : Number(plain.min);
              const max = plain.max === '' ? Infinity : Number(plain.max);
              // Not clampInt: a number field may legitimately hold a decimal,
              // and this only enforces the field's own bounds.
              const clamped = clamp(value, min, max);
              if (clamped !== value) {
                plain.value = String(clamped);
                plain.dispatchEvent(new Event('input'));
              }
            });
          }
          input = plain;
          getters[field.name] = () => plain.value;
        }
        // The composite fields and buttons set their own classes; everything
        // else gets the shared input treatment.
        if (!['multiselect', 'tags', 'pillgrid', 'allocation', 'button'].includes(field.type ?? ''))
          input.className = 'field';
        if (field.disabled) input.disabled = true;
        label.appendChild(input);
        if (extras[field.name]) label.appendChild(extras[field.name]);
        body.push(label);
        inputs[field.name] = input;
      }

      const onChange = options.onChange;
      if (onChange) {
        /** @type {ModalFormHandle} */
        const handle = {
          get: (name) => getters[name](),
          set: (name, value) => {
            if (setters[name]) setters[name](String(value));
            else inputs[name].value = String(value);
          },
          setOptions: (name, opts, max = Infinity) => rebuilders[name]?.(opts, max),
          setDisabled: (name, disabled) => {
            inputs[name].disabled = disabled;
          },
          setLabel: (name, text) => {
            labelTexts[name].nodeValue = text;
          },
          setRange: (name, min, max) => {
            const input = /** @type {HTMLInputElement} */ (inputs[name]);
            input.min = min === undefined ? '' : String(min);
            input.max = max === undefined ? '' : String(max);
          },
          setHidden: (name, hidden) => {
            wrappers[name].classList.toggle('modal__field--hidden', hidden);
          },
          setTotal: (name, total) => totals[name]?.(total),
        };
        for (const [name, input] of Object.entries(inputs)) {
          input.addEventListener('input', () => onChange(name, handle));
        }
      }

      const cancel = textButton('Cancel', () => close('cancel'));
      const submit = textButton(options.submitLabel ?? 'Create', undefined, {
        variant: 'primary',
        type: 'submit',
      });

      return {
        body,
        actions: [cancel, submit],
        initialFocus: fields.length ? inputs[fields[0].name] : submit,
      };
    },
    // Wait out any field still being read before collecting, so a submit that
    // races a file decode gets the picked image rather than an empty value. The
    // values are still read before the dialog leaves the document, since this
    // runs while it is still mounted and a getter reads its own input.
    result: (returnValue) =>
      returnValue === 'cancel'
        ? null
        : Promise.all(Object.values(reads)).then(() =>
            Object.fromEntries(Object.entries(getters).map(([k, get]) => [k, get()])),
          ),
  });
}

/**
 * Show a single-button acknowledgement modal (an alert): an optional heading, a
 * message, and one dismiss button. Resolves when dismissed. Used where there's
 * nothing to confirm or cancel — e.g. announcing an encounter the party walks
 * into.
 * @param {string} message
 * @param {{ label?: string, title?: string }} [options]
 * @returns {Promise<void>}
 */
export function alertModal(message, options = {}) {
  return openDialog({
    title: options.title,
    build: (close) => {
      const text = el('p', 'modal__message', message);
      const ok = textButton(options.label ?? 'OK', () => close('ok'), { variant: 'primary' });
      return { body: [text], actions: [ok], initialFocus: ok };
    },
  });
}

/**
 * Show a confirm modal. Resolves true if confirmed, false otherwise.
 * @param {string} message
 * @param {{ confirmLabel?: string, danger?: boolean }} [options]
 * @returns {Promise<boolean>}
 */
export function confirmModal(message, options = {}) {
  return openDialog({
    build: (close) => {
      const text = el('p', 'modal__message', message);
      const cancel = textButton('Cancel', () => close('cancel'));
      const confirm = textButton(options.confirmLabel ?? 'Confirm', () => close('confirm'), {
        variant: options.danger ? 'danger' : 'primary',
      });
      return { body: [text], actions: [cancel, confirm], initialFocus: confirm };
    },
    result: (returnValue) => returnValue === 'confirm',
  });
}

/**
 * The standard delete confirmation: `Delete "<name>"?` with the danger-styled
 * Delete button, so every delete across the app reads and looks the same.
 * `detail` appends a consequence sentence (e.g. what else is lost).
 * @param {string} name what's being deleted, shown quoted in the message
 * @param {string} [detail]
 * @returns {Promise<boolean>}
 */
export function confirmDelete(name, detail = '') {
  const message = `Delete "${name}"?${detail ? ` ${detail}` : ''}`;
  return confirmModal(message, { danger: true, confirmLabel: 'Delete' });
}
