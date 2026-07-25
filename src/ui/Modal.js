/**
 * Small helpers around the native <dialog> element, so features like "new node"
 * and "confirm delete" share one focus-managed, escape-closable modal instead
 * of hand-rolling overlay markup each time. Each call builds a dialog, appends
 * it to <body>, and removes it on close, resolving a Promise with the result.
 */

/** @typedef {{ name: string, label: string, type?: 'text' | 'number' | 'select' | 'file' | 'multiselect', value?: string | number, min?: number, options?: { value: string, label: string }[], full?: boolean }} ModalField */

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
 *   onChange?: (name: string, form: { get: (name: string) => string, set: (name: string, value: string | number) => void, setOptions: (name: string, options: { value: string, label: string }[]) => void }) => void,
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
    /** @type {Record<string, (options: { value: string, label: string }[]) => void>} */
    const rebuilders = {};
    for (const field of fields) {
      const label = document.createElement('label');
      label.className = field.full ? 'modal__field modal__field--full' : 'modal__field';
      label.textContent = field.label;

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
        // Preselect from a comma-joined `value`.
        const box = document.createElement('div');
        box.className = 'field modal__multiselect';
        /** @type {HTMLInputElement[]} */
        let checks = [];
        // Rebuild the checkbox rows for a fresh option set, checking those in
        // `selected`. Reused by the initial render and by onChange refilters.
        const render = (
          /** @type {{ value: string, label: string }[]} */ opts,
          /** @type {Set<string>} */ selected,
        ) => {
          box.textContent = '';
          checks = [];
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
        };
        render(
          field.options ?? [],
          new Set(field.value !== undefined ? String(field.value).split(',').filter(Boolean) : []),
        );
        input = /** @type {HTMLInputElement} */ (/** @type {unknown} */ (box));
        getters[field.name] = () =>
          checks
            .filter((c) => c.checked)
            .map((c) => c.value)
            .join(',');
        // Refilter keeps whatever is currently checked, even if it drops out of
        // the new option set (so a valid pick isn't silently lost mid-edit).
        rebuilders[field.name] = (opts) =>
          render(opts, new Set(checks.filter((c) => c.checked).map((c) => c.value)));
      } else {
        input = document.createElement('input');
        input.type = field.type ?? 'text';
        if (field.value !== undefined) input.value = String(field.value);
        if (field.min !== undefined) input.min = String(field.min);
        getters[field.name] = () => input.value;
      }
      if (field.type !== 'multiselect') input.className = 'field';
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
        ) => rebuilders[name]?.(opts),
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
