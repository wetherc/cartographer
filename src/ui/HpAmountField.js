import { hpAmount } from '../view/HpAmount.js';
import { numberField } from './formFields.js';

/**
 * The number field that sets how many HP a damage or heal button moves. The
 * character sheet, the creature rows of the Encounters panel, and the combat
 * screen all build it here, so they read an entry the same way (see
 * `view/HpAmount.js`). A focused field selects its text, so typing replaces
 * the number. Each edit calls `onInput` with the parsed amount, or with null
 * for an unusable entry, and the caller disables its buttons on null.
 * @param {{ value?: number, ariaLabel: string, className?: string,
 *   onInput?: (amount: number | null) => void }} opts
 * @returns {HTMLInputElement}
 */
export function buildHpAmountField({ value = 1, ariaLabel, className, onInput }) {
  const input = numberField(value, { min: 1, className, ariaLabel });
  input.addEventListener('focus', () => input.select());
  if (onInput) input.addEventListener('input', () => onInput(hpAmount(input.value)));
  return input;
}

/**
 * Read the amount for one button press and set the field back to 1, so a
 * second click does not repeat a big hit.
 * @param {HTMLInputElement} input
 * @returns {number | null}
 */
export function takeHpAmount(input) {
  const amount = hpAmount(input.value);
  input.value = '1';
  input.dispatchEvent(new Event('input'));
  return amount;
}
