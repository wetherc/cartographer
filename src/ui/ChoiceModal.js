import { openDialog } from './Modal.js';
import { textButton } from './buttons.js';
import { checkbox } from './formFields.js';
import { el } from './dom.js';

/**
 * One button of a choice modal. `value` is what the modal resolves with when
 * the button is pressed. The first choice is the primary one and takes focus.
 * @typedef {{ value: string, label: string }} Choice
 */

/**
 * Show a modal with a message, a row of choices, and a Cancel button. It
 * resolves with the value of the pressed choice, or "cancel" when the GM
 * presses Cancel or Escape. With `checkLabel` set, a checkbox sits under
 * the message, and `checked` in the result reads its state.
 * @param {string} message
 * @param {Choice[]} choices
 * @param {{ title?: string, checkLabel?: string }} [options]
 * @returns {Promise<{ choice: string, checked: boolean }>}
 */
export function choiceModal(message, choices, options = {}) {
  /** @type {HTMLInputElement | null} */
  let box = null;
  return openDialog({
    title: options.title ?? 'Confirm',
    build: (close) => {
      const text = el('p', 'modal__message', message);
      /** @type {HTMLElement[]} */
      const body = [text];
      if (options.checkLabel) {
        const check = checkbox(options.checkLabel, false);
        box = check.input;
        body.push(check.label);
      }
      const buttons = choices.map((c, i) =>
        textButton(c.label, () => close(c.value), i === 0 ? { variant: 'primary' } : {}),
      );
      const cancel = textButton('Cancel', () => close('cancel'));
      return {
        body,
        actions: [cancel, ...buttons.slice(1).reverse(), buttons[0]],
        initialFocus: buttons[0],
        description: text,
      };
    },
    result: (value) => ({
      choice: choices.some((c) => c.value === value) ? value : 'cancel',
      checked: box?.checked ?? false,
    }),
  });
}
