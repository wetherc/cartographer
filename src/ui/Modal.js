/**
 * This file holds small helpers around the native <dialog> element. Features
 * such as "new node" and "confirm delete" share one focus-managed,
 * escape-closable modal instead of custom overlay markup in each feature.
 * Each call builds a dialog, appends it to <body>, and removes it on close.
 * Each call resolves a Promise with the result.
 *
 * `openDialog` gives the shared lifecycle under all of that. Dialogs that
 * live in their own modules (the spell detail, combat setup, the generator,
 * the stat breakdown) also build on `openDialog`. This gives focus
 * restoration and dismissal one single owner.
 */

import { sectionLabel, textButton } from './buttons.js';
import { classNames, el } from './dom.js';
import {
  captioned,
  checkboxInput,
  numberField,
  select,
  setOptions,
  textareaField,
  textField,
} from './formFields.js';
import { readImageFile } from './imageField.js';
import { buildAllocation, buildMultiselect, buildPillGrid, buildTagsField } from './ModalFields.js';
import { dialogPartId, pickReturnFocus } from './dialogFocus.js';

/** @typedef {import('../types/modal.js').ModalField} ModalField */
/** @typedef {import('../types/modal.js').ModalFormHandle} ModalFormHandle */
/** @typedef {import('../types/modal.js').FieldOption} FieldOption */
/** @typedef {import('../types/modal.js').CompositeField} CompositeField */

/**
 * What a dialog builder returns: the content between the title and the
 * button row, the buttons, the element that takes focus when the dialog
 * opens, and the element that describes the dialog to a screen reader (the
 * message of a confirm or alert).
 * @typedef {{
 *   body?: Node[],
 *   actions?: HTMLElement[],
 *   initialFocus?: HTMLElement | null,
 *   description?: HTMLElement | null,
 * }} DialogParts
 */

/**
 * Open a modal dialog and resolve when it closes. This owns the lifecycle every
 * dialog in the app needs: it remembers which element opened the dialog so a
 * keyboard user does not land at the top of the document, appends the dialog
 * to `<body>`, shows it modally, focuses the right control, and on close
 * removes the element, restores focus, and resolves the promise. No dialog in
 * the app must re-implement this lifecycle. Escape-to-dismiss comes free with
 * `<dialog>`.
 *
 * The title gets an id and the dialog points at it with `aria-labelledby`,
 * so a screen reader announces the title and not just "dialog". A
 * `description` part is wired the same way through `aria-describedby`. On
 * close, focus goes to `returnFocus` when the caller named one. A caller
 * names it when the element that owns the interaction is not always the
 * element that had focus, for example a button that the browser does not
 * focus on click. Otherwise focus returns to the opener, and to `<main>` when
 * neither is in the document any longer (see `dialogFocus.js`).
 *
 * `build` receives a `close(value)` function that it wires into its own
 * buttons, and returns the parts to assemble. `result` turns the dialog's
 * return value into the value the caller expects. `result` runs while the
 * dialog is still in the document, so a mapper can read its own inputs.
 * `result` can return a promise when the value is not known until in-flight
 * work settles, for example a file decode.
 *
 * With `form` set, the parts go inside a `<form method="dialog">`. This makes
 * Enter submit the form, and makes a submit button's `value` become the
 * return value.
 *
 * `className` is appended to the shared `modal` class, so a dialog names only
 * what makes it different.
 * @template T
 * @param {{
 *   className?: string,
 *   title?: string,
 *   form?: boolean,
 *   returnFocus?: HTMLElement | null,
 *   build: (close: (value?: string) => void) => DialogParts,
 *   result?: (returnValue: string) => T | Promise<T>,
 * }} spec
 * @returns {Promise<T>}
 */
export function openDialog(spec) {
  return new Promise((resolve) => {
    const opener = /** @type {HTMLElement | null} */ (document.activeElement);
    const dialog = el('dialog', classNames(['modal', spec.className]));

    /** @type {HTMLElement} */
    let host = dialog;
    if (spec.form) {
      const form = el('form', 'modal__form u-col u-g3');
      form.method = 'dialog';
      dialog.appendChild(form);
      host = form;
    }

    if (spec.title) {
      const title = el('h2', 'modal__title', spec.title);
      title.id = dialogPartId('title');
      dialog.setAttribute('aria-labelledby', title.id);
      host.appendChild(title);
    }

    const parts = spec.build((value) => dialog.close(value));
    if (parts.description) {
      parts.description.id = dialogPartId('message');
      dialog.setAttribute('aria-describedby', parts.description.id);
    }
    host.append(...(parts.body ?? []));
    if (parts.actions?.length) host.appendChild(el('div', 'modal__actions', ...parts.actions));
    document.body.appendChild(dialog);

    dialog.addEventListener('close', () => {
      // A suspended form (see `suspend` on the form handle) closes only to
      // let the map take clicks, and opens again with its values.
      if (dialog.dataset.suspended) {
        delete dialog.dataset.suspended;
        return;
      }
      /** @param {any} value */
      const finish = (value) => {
        dialog.remove();
        const target = pickReturnFocus([spec.returnFocus, opener, document.querySelector('main')]);
        /** @type {HTMLElement | null} */ (target)?.focus();
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
 * The composite fields and the action button are not `<input>`s. The form
 * keeps one element per field so it can attach the change listener, toggle
 * `disabled`, and focus the first field without a check on each field kind.
 * This function is the one place that casts the element to `HTMLInputElement`.
 * @param {HTMLElement} element
 * @returns {HTMLInputElement}
 */
function asInput(element) {
  return /** @type {HTMLInputElement} */ (/** @type {unknown} */ (element));
}

/**
 * Show a form modal. Resolves to a record of field name to string value on
 * submit, or null if cancelled or dismissed. With `wide` set, the form lays
 * fields out two per row. A field marked `full` spans both columns. Use
 * `wide` for a dialog with too many fields to read as one tall stack.
 * `onChange` fires on every edit with the changed field's name and a
 * get/set handle on the whole form, so one field can drive another, for
 * example re-stamping default stats when an enemy's tier changes. Fields
 * marked `advanced` collect into one collapsed `<details>` captioned by
 * `advancedLabel`, placed where the first advanced field appears. This lets a
 * plain Enter submit their defaults without the form showing them.
 * `submitRequires` names checkbox and text fields, and the submit button
 * stays disabled until every named checkbox is ticked and every named text
 * field has text. A named text field is marked `aria-required`. `validate` runs when the GM
 * presses the submit button. A non-empty message keeps the dialog open and
 * shows the message above the buttons. `message` puts a paragraph
 * above the fields, and the dialog names it as its description. The dismiss
 * button reads "Cancel" unless `cancelLabel` names what declining does, and
 * Escape resolves the same way as that button.
 * @param {string} title
 * @param {ModalField[]} fields
 * @param {{
 *   message?: string,
 *   submitLabel?: string,
 *   cancelLabel?: string,
 *   wide?: boolean,
 *   advancedLabel?: string,
 *   onChange?: (name: string, form: ModalFormHandle) => void,
 *   submitRequires?: string[],
 *   validate?: (get: (name: string) => string) => string,
 * }} [options]
 * @returns {Promise<Record<string, string> | null>}
 */
export function promptModal(title, fields, options = {}) {
  /** @type {Record<string, HTMLInputElement | HTMLSelectElement>} */
  const inputs = {};
  /** Value accessors per field. A file input resolves to a data: URL, not
   * the input's fake path value. */
  /** @type {Record<string, () => string>} */
  const getters = {};
  /** In-flight reads per field, awaited before the submitted record is
   * collected. A file field's value is known only after its decode settles.
   * Collecting synchronously stored an empty value for a GM who submitted
   * quickly after a pick. This map stays separate from `getters`, because
   * `onChange`'s `get(name)` handle is read synchronously by five callers
   * and must stay a string, not a promise. */
  /** @type {Record<string, Promise<void>>} */
  const reads = {};
  /** Extra elements a field appends after its input, for example the file
   * field's inline error line. */
  /** @type {Record<string, HTMLElement>} */
  const extras = {};
  /** Option rebuilders per multiselect field. `onChange` uses these to
   * refilter a checkbox group in place and keep what is checked. */
  /** @type {Record<string, (options: FieldOption[], max?: number) => void>} */
  const rebuilders = {};
  /** Total setters per allocation field. `onChange` uses these to restate the
   * count to distribute when another field decides that count. */
  /** @type {Record<string, (total: number) => void>} */
  const totals = {};
  /** Label text nodes per field. `onChange` uses these to restate a caption,
   * for example "Class skills (choose 2)". */
  /** @type {Record<string, Text>} */
  const labelTexts = {};
  /** Value setters for the composite fields, whose state is not an
   * input.value. A plain field falls through to the default assignment. */
  /** @type {Record<string, (value: string) => void>} */
  const setters = {};
  /** The whole field wrapper per name. `onChange` uses these to show or hide
   * a field. */
  /** @type {Record<string, HTMLElement>} */
  const wrappers = {};

  return openDialog({
    className: options.wide ? 'modal--wide' : '',
    title,
    form: true,
    build: (close) => {
      /** @type {Node[]} */
      const body = [];
      /** The shared container for advanced fields. It is created when the
       * first advanced field appears, and mounted in its place. */
      /** @type {HTMLElement | null} */
      let advancedBox = null;
      const message = options.message ? el('p', 'modal__message', options.message) : null;
      if (message) body.push(message);
      for (const field of fields) {
        const labelText = document.createTextNode(field.label);
        const caption = el('span', '', labelText);
        labelTexts[field.name] = labelText;
        /** The checkbox field lays its caption and box out on one line. */
        let checkRow = false;

        /** @type {HTMLInputElement | HTMLSelectElement} */
        let input;
        if (field.type === 'select') {
          const choices = field.options ?? [];
          // No stated value means the first option, which is what a bare
          // `<select>` shows; naming it keeps `select`'s value argument honest.
          input = select(choices, String(field.value ?? choices[0]?.value ?? ''));
          getters[field.name] = () => input.value;
        } else if (field.type === 'checkbox') {
          // The box sits after its caption, not under it, so the label reads
          // as one line. The wrapper class carries that layout.
          const box = checkboxInput(!!field.value);
          checkRow = true;
          input = box;
          getters[field.name] = () => (box.checked ? '1' : '');
          setters[field.name] = (value) => {
            box.checked = !!value && value !== '0';
          };
        } else if (field.type === 'file') {
          // `readImageFile` decodes, downscales, and re-encodes a picked image
          // under a size cap before it becomes the field's value. The input
          // stays untouched, so the field keeps its initial value and an
          // existing image survives an edit.
          input = el('input', 'field');
          input.type = 'file';
          input.accept = 'image/*';
          let dataUrl = field.value !== undefined ? String(field.value) : '';
          // A rejected pick reports inline, not through `alertModal`. This
          // dialog stays open. A second modal on top steals focus from the
          // form the GM is editing.
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
                // Clear the selection so a re-pick of the same file fires
                // `change` again. A file input stays silent when a pick
                // matches its current value, so without this the retry does
                // nothing.
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
          // Each composite field owns its own state and rendering. The dialog
          // holds only its handle: one element to mount, one reader for the
          // submitted record, one writer for `onChange`'s `set`. A multiselect
          // also adds the refilter that `setOptions` routes to.
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
          // This is an in-form action, for example "Reroll scores". A click
          // fires the form's onChange under the field's name and adds no
          // value to the submitted record. The field's label sits on the
          // button itself. The listener reaches `button` at click time, after
          // the binding settles.
          const button = textButton(field.label, () => button.dispatchEvent(new Event('input')));
          // The field wrapper is a <label> with an empty caption, and
          // Chromium names a labelled button by that label, so the button
          // reads as a nameless button. aria-label names it by its text.
          button.setAttribute('aria-label', field.label);
          labelText.nodeValue = '';
          input = asInput(button);
          getters[field.name] = () => '';
        } else if (field.type === 'note') {
          // A line of text that onChange rewrites through setLabel, for
          // example a placement warning. The caption is a polite live region,
          // so a screen reader hears the new text. It adds no input.
          caption.setAttribute('role', 'status');
          caption.className = 'modal__note';
          input = asInput(el('span', ''));
          getters[field.name] = () => '';
        } else if (field.type === 'textarea') {
          // A prose field gets the same box the rail forms give it, rather
          // than a one-line input that hides most of what the GM typed.
          const area = textareaField(field.value === undefined ? '' : String(field.value), {
            rows: field.rows,
            placeholder: field.placeholder,
          });
          input = asInput(area);
          getters[field.name] = () => area.value;
        } else {
          // A plain text or number field comes from the same builders the
          // inline rail forms use, so the two paths agree on the field class
          // and on the number field's clamp when an edit commits.
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
          // A search field narrows another field, and an Enter that submits
          // from it acts on a choice that the GM has not looked at yet.
          if (field.type === 'search')
            plain.addEventListener('keydown', (event) => {
              if (event.key === 'Enter') event.preventDefault();
            });
          input = plain;
          getters[field.name] = () => plain.value;
        }
        if (field.disabled) input.disabled = true;
        const label = captioned(
          caption,
          input,
          classNames([
            'modal__field u-col u-g1 u-muted',
            checkRow && 'modal__field--check',
            field.full && 'modal__field--full',
            field.newRow && 'modal__field--break',
            field.hidden && 'modal__field--hidden',
          ]),
        );
        if (extras[field.name]) label.appendChild(extras[field.name]);
        wrappers[field.name] = label;
        // An advanced field sits in the disclosure, whose summary names it.
        if (field.section && !field.advanced)
          body.push(sectionLabel(field.section, { tag: 'h3', className: 'modal__section' }));
        if (field.advanced) {
          if (!advancedBox) {
            advancedBox = el('div', 'modal__advanced-fields');
            body.push(
              el(
                'details',
                'modal__advanced',
                el('summary', 'modal__advanced-summary', options.advancedLabel ?? 'More options'),
                advancedBox,
              ),
            );
          }
          advancedBox.appendChild(label);
        } else {
          body.push(label);
        }
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
          setOptions: (name, opts, max = Infinity) => {
            const input = inputs[name];
            if (rebuilders[name]) rebuilders[name](opts, max);
            else if (input instanceof HTMLSelectElement) {
              // A plain select keeps its choice while that choice is still
              // offered, and falls back to the first option otherwise.
              const kept = opts.some((o) => o.value === input.value);
              setOptions(input, opts, kept ? input.value : (opts[0]?.value ?? ''));
            }
          },
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
          suspend: async (name, work) => {
            const button = inputs[name];
            const dialog = /** @type {HTMLDialogElement} */ (button.closest('dialog'));
            dialog.dataset.suspended = 'true';
            dialog.close();
            try {
              await work();
            } finally {
              dialog.showModal();
              button.focus();
            }
          },
        };
        for (const [name, input] of Object.entries(inputs)) {
          input.addEventListener('input', () => onChange(name, handle));
        }
      }

      const cancel = textButton(options.cancelLabel ?? 'Cancel', () => close('cancel'));
      const submit = textButton(options.submitLabel ?? 'Create', undefined, {
        variant: 'primary',
        type: 'submit',
        value: 'submit',
      });
      // The fields named by submitRequires keep the submit button disabled
      // until every checkbox is ticked and every text field has text, so the
      // dialog does not take input that the caller then refuses.
      const gates = /** @type {HTMLInputElement[]} */ (
        (options.submitRequires ?? [])
          .map((name) => inputs[name])
          .filter((input) => input instanceof HTMLInputElement)
      );
      const met = (/** @type {HTMLInputElement} */ input) =>
        input.type === 'checkbox' ? input.checked : input.value.trim() !== '';
      const syncGates = () => {
        submit.disabled = gates.some((input) => !met(input));
      };
      for (const input of gates) {
        if (input.type !== 'checkbox') input.setAttribute('aria-required', 'true');
        input.addEventListener('change', syncGates);
        input.addEventListener('input', syncGates);
      }
      syncGates();
      // A refused submit cancels the click, so the form does not close. Enter
      // in a field submits through a click on this button too.
      const invalid = el('p', 'modal__error');
      invalid.setAttribute('role', 'alert');
      invalid.hidden = true;
      const validate = options.validate;
      if (validate) {
        body.push(invalid);
        submit.addEventListener('click', (event) => {
          const problem = validate((name) => getters[name]?.() ?? '');
          invalid.textContent = problem;
          invalid.hidden = !problem;
          if (problem) event.preventDefault();
        });
      }

      return {
        body,
        actions: [cancel, submit],
        initialFocus: fields.length ? inputs[fields[0].name] : submit,
        ...(message ? { description: message } : {}),
      };
    },
    // Wait for any field still being read before collecting. This gives a
    // submit that races a file decode the picked image, not an empty value.
    // The values are still read before the dialog leaves the document, because
    // this code runs while the dialog is still mounted, and a getter reads its
    // own input.
    // Only the submit button sets the return value to `submit`. Enter in a
    // field submits through that button too. Escape leaves the return value
    // empty, so it resolves null the same way as the dismiss button.
    result: (returnValue) =>
      returnValue !== 'submit'
        ? null
        : Promise.all(Object.values(reads)).then(() =>
            Object.fromEntries(Object.entries(getters).map(([k, get]) => [k, get()])),
          ),
  });
}

/**
 * Show a single-button acknowledgement modal, an alert, with a heading, a
 * message, and one dismiss button. Resolves when dismissed. Use this where
 * there is nothing to confirm or cancel, for example to announce an encounter
 * the party walks into. The heading defaults to "Notice", so the dialog always
 * has a name. `returnFocus` takes focus on close when the opener is gone.
 * @param {string} message
 * @param {{ label?: string, title?: string, returnFocus?: HTMLElement | null }} [options]
 * @returns {Promise<void>}
 */
export function alertModal(message, options = {}) {
  return openDialog({
    title: options.title ?? 'Notice',
    returnFocus: options.returnFocus,
    build: (close) => {
      const text = el('p', 'modal__message', message);
      const ok = textButton(options.label ?? 'OK', () => close('ok'), { variant: 'primary' });
      return { body: [text], actions: [ok], initialFocus: ok, description: text };
    },
  });
}

/**
 * Show a confirm modal. Resolves true if confirmed, false otherwise. `variant`
 * styles the confirm button, and names the same variants a button does, so a
 * destructive confirm reads as `variant: 'danger'` here and everywhere else.
 * A danger confirm opens with focus on Cancel, so a stray Enter does not
 * delete or replace anything. The heading defaults to the confirm label as a
 * question ("End combat?"), so the dialog names the action it asks about,
 * or to "Confirm" with no label. The dismiss button reads "Cancel" unless `cancelLabel` names what declining does.
 * @param {string} message
 * @param {{
 *   confirmLabel?: string,
 *   cancelLabel?: string,
 *   variant?: 'primary' | 'danger',
 *   title?: string,
 *   returnFocus?: HTMLElement | null,
 * }} [options]
 * @returns {Promise<boolean>}
 */
export function confirmModal(message, options = {}) {
  const variant = options.variant ?? 'primary';
  return openDialog({
    title: options.title ?? (options.confirmLabel ? `${options.confirmLabel}?` : 'Confirm'),
    returnFocus: options.returnFocus,
    build: (close) => {
      const text = el('p', 'modal__message', message);
      const cancel = textButton(options.cancelLabel ?? 'Cancel', () => close('cancel'));
      const confirm = textButton(options.confirmLabel ?? 'Confirm', () => close('confirm'), {
        variant,
      });
      return {
        body: [text],
        actions: [cancel, confirm],
        initialFocus: variant === 'danger' ? cancel : confirm,
        description: text,
      };
    },
    result: (returnValue) => returnValue === 'confirm',
  });
}

/**
 * The standard delete confirmation: the title `Delete <name>?`, the message
 * `This deletes "<name>".`, and the danger-styled Delete button. This makes
 * every delete across the app read and look the same. `detail` appends a
 * consequence sentence, for example what else is lost.
 * @param {string} name what's being deleted, shown quoted in the message
 * @param {string} [detail]
 * @returns {Promise<boolean>}
 */
export function confirmDelete(name, detail = '') {
  const message = `This deletes "${name}".${detail ? ` ${detail}` : ''}`;
  return confirmModal(message, {
    variant: 'danger',
    confirmLabel: 'Delete',
    title: `Delete ${name}?`,
  });
}
