/**
 * Small helpers around the native <dialog> element, so features like "new node"
 * and "confirm delete" share one focus-managed, escape-closable modal instead
 * of hand-rolling overlay markup each time. Each call builds a dialog, appends
 * it to <body>, and removes it on close, resolving a Promise with the result.
 */

/** @typedef {{ name: string, label: string, type?: 'text' | 'number' | 'select' | 'file' | 'multiselect' | 'tags' | 'button', value?: string | number, min?: number, options?: { value: string, label: string }[], full?: boolean, max?: number, emptyText?: string, fixedHeight?: boolean, disabled?: boolean }} ModalField */

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
 *   onChange?: (name: string, form: { get: (name: string) => string, set: (name: string, value: string | number) => void, setOptions: (name: string, options: { value: string, label: string }[], max?: number) => void, setDisabled: (name: string, disabled: boolean) => void, setLabel: (name: string, text: string) => void, setRange: (name: string, min?: number, max?: number) => void }) => void,
 * }} [options]
 * @returns {Promise<Record<string, string> | null>}
 */
export function promptModal(title, fields, options = {}) {
  return new Promise((resolve) => {
    // Return focus to whatever opened the dialog once it closes, so keyboard
    // users aren't dropped at the top of the document.
    const opener = /** @type {HTMLElement | null} */ (document.activeElement);
    const dialog = document.createElement('dialog');
    dialog.className = options.wide ? 'modal modal--wide' : 'modal';

    const form = document.createElement('form');
    form.method = 'dialog';
    form.className = 'modal__form';

    const heading = document.createElement('h2');
    heading.className = 'modal__title';
    heading.textContent = title;
    form.appendChild(heading);

    /** @type {Record<string, HTMLInputElement | HTMLSelectElement>} */
    const inputs = {};
    /** Value accessors per field — file inputs resolve to a data: URL rather
     * than the input's fakepath value. */
    /** @type {Record<string, () => string>} */
    const getters = {};
    /** Option rebuilders per multiselect field, so onChange can refilter a
     * checkbox group in place (preserving what's checked). */
    /** @type {Record<string, (options: { value: string, label: string }[], max?: number) => void>} */
    const rebuilders = {};
    /** Label text nodes per field, so onChange can restate a caption (e.g.
     * "Class skills (choose 2)"). */
    /** @type {Record<string, Text>} */
    const labelTexts = {};
    for (const field of fields) {
      const label = document.createElement('label');
      label.className = field.full ? 'modal__field modal__field--full' : 'modal__field';
      const labelText = document.createTextNode(field.label);
      label.appendChild(labelText);
      labelTexts[field.name] = labelText;

      /** @type {HTMLInputElement | HTMLSelectElement} */
      let input;
      if (field.type === 'select') {
        input = document.createElement('select');
        for (const option of field.options ?? []) {
          const el = document.createElement('option');
          el.value = option.value;
          el.textContent = option.label;
          input.appendChild(el);
        }
        if (field.value !== undefined) input.value = String(field.value);
        getters[field.name] = () => input.value;
      } else if (field.type === 'file') {
        // A picked image is read into a data: URL; leaving the input untouched
        // keeps the field's initial value (an existing image survives an edit).
        input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        let dataUrl = field.value !== undefined ? String(field.value) : '';
        input.addEventListener('change', () => {
          const file = /** @type {HTMLInputElement} */ (input).files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            dataUrl = String(reader.result ?? '');
          };
          reader.readAsDataURL(file);
        });
        getters[field.name] = () => dataUrl;
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
          new Set(field.value !== undefined ? String(field.value).split(',').filter(Boolean) : []),
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
            const pill = document.createElement('span');
            pill.className = 'modal__tag';
            pill.textContent = tag;
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'modal__tag-remove';
            remove.textContent = '×';
            remove.setAttribute('aria-label', `Remove ${tag}`);
            remove.addEventListener('click', () => {
              tags = tags.filter((t) => t !== tag);
              render();
              entry.focus();
            });
            pill.appendChild(remove);
            box.appendChild(pill);
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
      // The composite fields (multiselect, tags) and buttons set their own
      // classes; everything else gets the shared input treatment.
      if (!['multiselect', 'tags', 'button'].includes(field.type ?? '')) input.className = 'field';
      if (field.disabled) input.disabled = true;
      label.appendChild(input);
      form.appendChild(label);
      inputs[field.name] = input;
    }

    const onChange = options.onChange;
    if (onChange) {
      const handle = {
        get: (/** @type {string} */ name) => getters[name](),
        set: (/** @type {string} */ name, /** @type {string | number} */ value) => {
          inputs[name].value = String(value);
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
      };
      for (const [name, input] of Object.entries(inputs)) {
        input.addEventListener('input', () => onChange(name, handle));
      }
    }

    const actions = document.createElement('div');
    actions.className = 'modal__actions';

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => dialog.close('cancel'));

    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'btn btn--primary';
    submit.textContent = options.submitLabel ?? 'Create';

    actions.append(cancel, submit);
    form.appendChild(actions);
    dialog.appendChild(form);
    document.body.appendChild(dialog);

    dialog.addEventListener('close', () => {
      const result =
        dialog.returnValue === 'cancel'
          ? null
          : Object.fromEntries(Object.entries(getters).map(([k, get]) => [k, get()]));
      dialog.remove();
      opener?.focus?.();
      resolve(result);
    });

    dialog.showModal();
    fields.length ? inputs[fields[0].name].focus() : submit.focus();
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
  return new Promise((resolve) => {
    const opener = /** @type {HTMLElement | null} */ (document.activeElement);
    const dialog = document.createElement('dialog');
    dialog.className = 'modal';

    if (options.title) {
      const heading = document.createElement('h2');
      heading.className = 'modal__title';
      heading.textContent = options.title;
      dialog.appendChild(heading);
    }

    const text = document.createElement('p');
    text.className = 'modal__message';
    text.textContent = message;

    const actions = document.createElement('div');
    actions.className = 'modal__actions';

    const ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'btn btn--primary';
    ok.textContent = options.label ?? 'OK';
    ok.addEventListener('click', () => dialog.close('ok'));

    actions.append(ok);
    dialog.append(text, actions);
    document.body.appendChild(dialog);

    dialog.addEventListener('close', () => {
      dialog.remove();
      opener?.focus?.();
      resolve();
    });

    dialog.showModal();
    ok.focus();
  });
}

/**
 * Show a confirm modal. Resolves true if confirmed, false otherwise.
 * @param {string} message
 * @param {{ confirmLabel?: string, danger?: boolean }} [options]
 * @returns {Promise<boolean>}
 */
export function confirmModal(message, options = {}) {
  return new Promise((resolve) => {
    const opener = /** @type {HTMLElement | null} */ (document.activeElement);
    const dialog = document.createElement('dialog');
    dialog.className = 'modal';

    const text = document.createElement('p');
    text.className = 'modal__message';
    text.textContent = message;

    const actions = document.createElement('div');
    actions.className = 'modal__actions';

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => dialog.close('cancel'));

    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.className = options.danger ? 'btn btn--danger' : 'btn btn--primary';
    confirm.textContent = options.confirmLabel ?? 'Confirm';
    confirm.addEventListener('click', () => dialog.close('confirm'));

    actions.append(cancel, confirm);
    dialog.append(text, actions);
    document.body.appendChild(dialog);

    dialog.addEventListener('close', () => {
      const confirmed = dialog.returnValue === 'confirm';
      dialog.remove();
      opener?.focus?.();
      resolve(confirmed);
    });

    dialog.showModal();
    confirm.focus();
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
