/**
 * Small helpers around the native <dialog> element, so features like "new node"
 * and "confirm delete" share one focus-managed, escape-closable modal instead
 * of hand-rolling overlay markup each time. Each call builds a dialog, appends
 * it to <body>, and removes it on close, resolving a Promise with the result.
 */

/** @typedef {{ name: string, label: string, type?: 'text' | 'number' | 'select', value?: string | number, min?: number, options?: { value: string, label: string }[] }} ModalField */

/**
 * Show a form modal. Resolves to a record of field name -> string value on
 * submit, or null if cancelled/dismissed.
 * @param {string} title
 * @param {ModalField[]} fields
 * @param {{ submitLabel?: string }} [options]
 * @returns {Promise<Record<string, string> | null>}
 */
export function promptModal(title, fields, options = {}) {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'modal';

    const form = document.createElement('form');
    form.method = 'dialog';
    form.className = 'modal__form';

    const heading = document.createElement('h2');
    heading.className = 'modal__title';
    heading.textContent = title;
    form.appendChild(heading);

    /** @type {Record<string, HTMLInputElement | HTMLSelectElement>} */
    const inputs = {};
    for (const field of fields) {
      const label = document.createElement('label');
      label.className = 'modal__field';
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
      } else {
        input = document.createElement('input');
        input.type = field.type ?? 'text';
        if (field.value !== undefined) input.value = String(field.value);
        if (field.min !== undefined) input.min = String(field.min);
      }
      input.className = 'field';
      label.appendChild(input);
      form.appendChild(label);
      inputs[field.name] = input;
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
          : Object.fromEntries(Object.entries(inputs).map(([k, el]) => [k, el.value]));
      dialog.remove();
      resolve(result);
    });

    dialog.showModal();
    fields.length ? inputs[fields[0].name].focus() : submit.focus();
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
      resolve(confirmed);
    });

    dialog.showModal();
    confirm.focus();
  });
}
