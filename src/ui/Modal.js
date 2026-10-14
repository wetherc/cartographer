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
import { captioned } from './formFields.js';
import { buildFieldControl } from './FieldControl.js';
import { applyFieldRules, hasFieldRules } from '../view/FieldRules.js';
import { dialogPartId, noteFocus, pickReturnFocus, repairFocus } from './dialogFocus.js';

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
      // The caller often re-renders the list that contains the opener once
      // the promise resolves, and that removes the opener from the page.
      // Focus goes back at once, and again on the next frame when the
      // re-render dropped it onto the body.
      /** @param {any} value */
      const finish = (value) => {
        dialog.remove();
        const main = /** @type {HTMLElement | null} */ (document.querySelector('main'));
        const target = pickReturnFocus([spec.returnFocus, opener, main]);
        const note = noteFocus(
          /** @type {HTMLElement | null} */ (target === main ? opener : target),
          document.body,
        );
        resolve(value);
        /** @type {HTMLElement | null} */ (target)?.focus();
        requestAnimationFrame(() => repairFocus(document, note, main));
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
  /** Value setters per field, which `onChange` routes `set` through. */
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
        const control = buildFieldControl(field, {
          // The picked image's decode is tracked, so a quick submit waits for it.
          onRead: (read) => {
            reads[field.name] = read;
          },
        });
        const input = control.input;
        getters[field.name] = control.get;
        setters[field.name] = control.set;
        if (control.setOptions) rebuilders[field.name] = control.setOptions;
        if (control.setTotal) totals[field.name] = control.setTotal;
        if (control.extra) extras[field.name] = control.extra;
        // The box of a checkbox sits after its caption, so the label reads as
        // one line, and the wrapper class contains that layout. A button names
        // itself, so its caption stays empty. A note's caption is the field,
        // a polite live region that onChange rewrites.
        const checkRow = control.layout === 'check';
        if (control.layout === 'button') labelText.nodeValue = '';
        if (control.layout === 'note') {
          caption.setAttribute('role', 'status');
          caption.className = 'modal__note';
        }
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
      if (onChange || hasFieldRules(fields)) {
        /** @type {ModalFormHandle} */
        const handle = {
          get: (name) => getters[name](),
          set: (name, value) => setters[name](String(value)),
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
        /** @param {string} name */
        const readRuled = (name) => getters[name]?.() ?? '';
        // The enabledWhen rules run first, so an onChange can still override
        // one of them for this edit.
        applyFieldRules(fields, null, readRuled, handle.setDisabled);
        for (const [name, input] of Object.entries(inputs)) {
          input.addEventListener('input', () => {
            applyFieldRules(fields, name, readRuled, handle.setDisabled);
            onChange?.(name, handle);
          });
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
