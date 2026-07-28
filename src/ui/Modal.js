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

import { readImageFile } from './imageField.js';
import { removableChip } from './buttons.js';

/** @typedef {{ name: string, label: string, type?: 'text' | 'number' | 'select' | 'file' | 'multiselect' | 'tags' | 'button' | 'pillgrid', value?: string | number, min?: number, options?: { value: string, label: string, disabled?: boolean }[], rows?: { value: string, label: string }[], full?: boolean, max?: number, emptyText?: string, fixedHeight?: boolean, disabled?: boolean, hidden?: boolean }} ModalField */

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
    const dialog = document.createElement('dialog');
    dialog.className = spec.className ?? 'modal';

    /** @type {HTMLElement} */
    let host = dialog;
    if (spec.form) {
      const form = document.createElement('form');
      form.method = 'dialog';
      form.className = 'modal__form';
      dialog.appendChild(form);
      host = form;
    }

    if (spec.title) {
      const heading = document.createElement('h2');
      heading.className = 'modal__title';
      heading.textContent = spec.title;
      host.appendChild(heading);
    }

    const parts = spec.build((value) => dialog.close(value));
    host.append(...(parts.body ?? []));
    if (parts.actions?.length) {
      const bar = document.createElement('div');
      bar.className = 'modal__actions';
      bar.append(...parts.actions);
      host.appendChild(bar);
    }
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
 *   onChange?: (name: string, form: { get: (name: string) => string, set: (name: string, value: string | number) => void, setOptions: (name: string, options: { value: string, label: string }[], max?: number) => void, setDisabled: (name: string, disabled: boolean) => void, setLabel: (name: string, text: string) => void, setRange: (name: string, min?: number, max?: number) => void, setHidden: (name: string, hidden: boolean) => void }) => void,
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
  /** @type {Record<string, (options: { value: string, label: string }[], max?: number) => void>} */
  const rebuilders = {};
  /** Label text nodes per field, so onChange can restate a caption (e.g.
   * "Class skills (choose 2)"). */
  /** @type {Record<string, Text>} */
  const labelTexts = {};
  /** Value setters for composite fields whose state isn't an input.value
   * (the pill grid); plain fields fall through to the default assignment. */
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
        const label = document.createElement('label');
        label.className = field.full ? 'modal__field modal__field--full' : 'modal__field';
        if (field.hidden) label.classList.add('modal__field--hidden');
        const labelText = document.createTextNode(field.label);
        label.appendChild(labelText);
        labelTexts[field.name] = labelText;
        wrappers[field.name] = label;

        /** @type {HTMLInputElement | HTMLSelectElement} */
        let input;
        if (field.type === 'select') {
          input = document.createElement('select');
          for (const option of field.options ?? []) {
            const el = document.createElement('option');
            el.value = option.value;
            el.textContent = option.label;
            if (option.disabled) el.disabled = true;
            input.appendChild(el);
          }
          if (field.value !== undefined) input.value = String(field.value);
          getters[field.name] = () => input.value;
        } else if (field.type === 'file') {
          // A picked image is decoded, downscaled, and re-encoded under a size cap
          // by `readImageFile` before it becomes the field's value; leaving the
          // input untouched keeps the field's initial value (an existing image
          // survives an edit).
          input = document.createElement('input');
          input.type = 'file';
          input.accept = 'image/*';
          let dataUrl = field.value !== undefined ? String(field.value) : '';
          // A rejected pick reports inline rather than through `alertModal`: this
          // dialog is still open, and a second modal over it steals focus from the
          // form the GM is in the middle of.
          const error = document.createElement('p');
          error.className = 'modal__error';
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
        } else if (field.type === 'multiselect') {
          // A scrollable checkbox group: the value is the comma-joined set of
          // checked option values (slug ids, so the separator is unambiguous).
          // Preselect from a comma-joined `value`. `max` caps the picks by
          // disabling the unchecked boxes once reached; `fixedHeight` pins the
          // box so a refilter doesn't reflow the dialog, with `emptyText`
          // filling it while there are no options.
          const box = document.createElement('div');
          box.className = field.fixedHeight
            ? 'field modal__multiselect modal__multiselect--fixed'
            : 'field modal__multiselect';
          /** @type {HTMLInputElement[]} */
          let checks = [];
          let max = field.max ?? Infinity;
          const enforceMax = () => {
            const full = checks.filter((c) => c.checked).length >= max;
            for (const check of checks) check.disabled = full && !check.checked;
          };
          // Rebuild the checkbox rows for a fresh option set, checking those in
          // `selected`. Reused by the initial render and by onChange refilters.
          const render = (
            /** @type {{ value: string, label: string }[]} */ opts,
            /** @type {Set<string>} */ selected,
          ) => {
            box.textContent = '';
            checks = [];
            if (!opts.length && field.emptyText) {
              const empty = document.createElement('p');
              empty.className = 'empty-state';
              empty.textContent = field.emptyText;
              box.appendChild(empty);
            }
            for (const option of opts) {
              const row = document.createElement('label');
              row.className = 'modal__multiselect-option';
              const check = document.createElement('input');
              check.type = 'checkbox';
              check.value = option.value;
              check.checked = selected.has(option.value);
              const text = document.createElement('span');
              text.textContent = option.label;
              row.append(check, text);
              box.appendChild(row);
              checks.push(check);
            }
            enforceMax();
          };
          render(
            field.options ?? [],
            new Set(
              field.value !== undefined ? String(field.value).split(',').filter(Boolean) : [],
            ),
          );
          box.addEventListener('input', enforceMax);
          input = /** @type {HTMLInputElement} */ (/** @type {unknown} */ (box));
          getters[field.name] = () =>
            checks
              .filter((c) => c.checked)
              .map((c) => c.value)
              .join(',');
          // Refilter keeps whatever is currently checked, even if it drops out of
          // the new option set (so a valid pick isn't silently lost mid-edit).
          rebuilders[field.name] = (opts, newMax) => {
            if (newMax !== undefined) max = newMax;
            render(opts, new Set(checks.filter((c) => c.checked).map((c) => c.value)));
          };
        } else if (field.type === 'tags') {
          // A pill list with an inline text entry: Enter finalizes the typed
          // text as a pill, the x removes one, Backspace in an empty entry
          // removes the last. The value is the comma-joined pills plus any
          // un-finalized text, so nothing typed is lost on submit.
          const box = document.createElement('div');
          box.className = 'field modal__tags';
          /** @type {string[]} */
          let tags =
            field.value !== undefined
              ? String(field.value)
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean)
              : [];
          const entry = document.createElement('input');
          entry.type = 'text';
          entry.className = 'modal__tags-input';
          const render = () => {
            box.textContent = '';
            for (const tag of tags) {
              box.appendChild(
                removableChip(tag, () => {
                  tags = tags.filter((t) => t !== tag);
                  render();
                  entry.focus();
                }),
              );
            }
            box.appendChild(entry);
          };
          entry.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
              event.preventDefault(); // finalize the pill, don't submit the dialog
              const text = entry.value.trim();
              if (text && !tags.includes(text)) tags.push(text);
              entry.value = '';
              render();
              entry.focus();
            } else if (event.key === 'Backspace' && !entry.value && tags.length) {
              tags.pop();
              render();
              entry.focus();
            }
          });
          box.addEventListener('click', () => entry.focus());
          render();
          input = /** @type {HTMLInputElement} */ (/** @type {unknown} */ (box));
          getters[field.name] = () => [...tags, entry.value.trim()].filter(Boolean).join(',');
        } else if (field.type === 'pillgrid') {
          // An assignment grid: each row (e.g. an ability) holds at most one of
          // the option values (e.g. the standard array), every value used at
          // most once. Clicking assigns, clicking the held pill un-assigns, and
          // clicking a pill another row already holds moves it here (the other
          // row takes this row's old value, if any). The value is the
          // comma-joined `row:value` pairs of the assigned rows.
          const box = document.createElement('div');
          box.className = 'modal__pillgrid';
          const parse = (/** @type {string} */ value) =>
            Object.fromEntries(
              value
                .split(',')
                .filter(Boolean)
                .map((pair) => pair.split(':')),
            );
          /** @type {Record<string, string>} */
          let assigned = parse(field.value !== undefined ? String(field.value) : '');
          const render = () => {
            box.textContent = '';
            for (const row of field.rows ?? []) {
              const rowEl = document.createElement('div');
              rowEl.className = 'modal__pillgrid-row';
              const rowLabel = document.createElement('span');
              rowLabel.className = 'modal__pillgrid-label';
              rowLabel.textContent = row.label;
              rowEl.appendChild(rowLabel);
              for (const option of field.options ?? []) {
                const pill = document.createElement('button');
                pill.type = 'button';
                pill.className =
                  assigned[row.value] === option.value
                    ? 'modal__pill modal__pill--selected'
                    : 'modal__pill';
                pill.textContent = option.label;
                pill.setAttribute('aria-pressed', String(assigned[row.value] === option.value));
                pill.addEventListener('click', () => {
                  const prev = assigned[row.value];
                  if (prev === option.value) {
                    delete assigned[row.value];
                  } else {
                    const holder = Object.keys(assigned).find(
                      (k) => k !== row.value && assigned[k] === option.value,
                    );
                    assigned[row.value] = option.value;
                    if (holder && prev !== undefined) assigned[holder] = prev;
                    else if (holder) delete assigned[holder];
                  }
                  render();
                  box.dispatchEvent(new Event('input'));
                });
                rowEl.appendChild(pill);
              }
              box.appendChild(rowEl);
            }
          };
          render();
          input = /** @type {HTMLInputElement} */ (/** @type {unknown} */ (box));
          getters[field.name] = () =>
            Object.entries(assigned)
              .map(([k, v]) => `${k}:${v}`)
              .join(',');
          setters[field.name] = (value) => {
            assigned = parse(value);
            render();
          };
        } else if (field.type === 'button') {
          // An in-form action (e.g. "Reroll scores"): clicking it fires the
          // form's onChange under the field's name; it contributes no value to
          // the submitted record. The field's label sits on the button itself.
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'btn';
          button.textContent = field.label;
          labelText.nodeValue = '';
          button.addEventListener('click', () => button.dispatchEvent(new Event('input')));
          input = /** @type {HTMLInputElement} */ (/** @type {unknown} */ (button));
          getters[field.name] = () => '';
        } else {
          const plain = document.createElement('input');
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
              const clamped = Math.min(max, Math.max(min, value));
              if (clamped !== value) {
                plain.value = String(clamped);
                plain.dispatchEvent(new Event('input'));
              }
            });
          }
          input = plain;
          getters[field.name] = () => plain.value;
        }
        // The composite fields (multiselect, tags, pillgrid) and buttons set
        // their own classes; everything else gets the shared input treatment.
        if (!['multiselect', 'tags', 'pillgrid', 'button'].includes(field.type ?? ''))
          input.className = 'field';
        if (field.disabled) input.disabled = true;
        label.appendChild(input);
        if (extras[field.name]) label.appendChild(extras[field.name]);
        body.push(label);
        inputs[field.name] = input;
      }

      const onChange = options.onChange;
      if (onChange) {
        const handle = {
          get: (/** @type {string} */ name) => getters[name](),
          set: (/** @type {string} */ name, /** @type {string | number} */ value) => {
            if (setters[name]) setters[name](String(value));
            else inputs[name].value = String(value);
          },
          setOptions: (
            /** @type {string} */ name,
            /** @type {{ value: string, label: string }[]} */ opts,
            /** @type {number} */ max = Infinity,
          ) => rebuilders[name]?.(opts, max),
          setDisabled: (/** @type {string} */ name, /** @type {boolean} */ disabled) => {
            inputs[name].disabled = disabled;
          },
          setLabel: (/** @type {string} */ name, /** @type {string} */ text) => {
            labelTexts[name].nodeValue = text;
          },
          setRange: (
            /** @type {string} */ name,
            /** @type {number | undefined} */ min,
            /** @type {number | undefined} */ max,
          ) => {
            const input = /** @type {HTMLInputElement} */ (inputs[name]);
            input.min = min === undefined ? '' : String(min);
            input.max = max === undefined ? '' : String(max);
          },
          setHidden: (/** @type {string} */ name, /** @type {boolean} */ hidden) => {
            wrappers[name].classList.toggle('modal__field--hidden', hidden);
          },
        };
        for (const [name, input] of Object.entries(inputs)) {
          input.addEventListener('input', () => onChange(name, handle));
        }
      }

      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'btn';
      cancel.textContent = 'Cancel';
      cancel.addEventListener('click', () => close('cancel'));

      const submit = document.createElement('button');
      submit.type = 'submit';
      submit.className = 'btn btn--primary';
      submit.textContent = options.submitLabel ?? 'Create';

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
      const text = document.createElement('p');
      text.className = 'modal__message';
      text.textContent = message;

      const ok = document.createElement('button');
      ok.type = 'button';
      ok.className = 'btn btn--primary';
      ok.textContent = options.label ?? 'OK';
      ok.addEventListener('click', () => close('ok'));

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
      const text = document.createElement('p');
      text.className = 'modal__message';
      text.textContent = message;

      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'btn';
      cancel.textContent = 'Cancel';
      cancel.addEventListener('click', () => close('cancel'));

      const confirm = document.createElement('button');
      confirm.type = 'button';
      confirm.className = options.danger ? 'btn btn--danger' : 'btn btn--primary';
      confirm.textContent = options.confirmLabel ?? 'Confirm';
      confirm.addEventListener('click', () => close('confirm'));

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
