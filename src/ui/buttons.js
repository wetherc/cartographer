import { classNames, el, setAttrs } from './dom.js';
import { icon } from './icons.js';

/**
 * This module builds the button idioms every panel uses: an icon-only
 * square button and a text button with an optional leading icon. The
 * helpers keep aria-label and title coverage uniform across the app. A
 * destructive button passes variant: 'danger'. The app rule is that a
 * delete control is always danger-styled and always visible. emptyState is
 * a third primitive: the muted "nothing here" paragraph every list panel
 * shows. chip and removableChip are a fourth primitive: a small labeled
 * tag, with or without an x to remove it. segSwitch is a fifth primitive: a
 * segmented group of buttons where only one choice is active.
 */

/**
 * An icon-only `btn btn--icon` button. The aria-label is required, since an
 * icon-only button has no other accessible name. It becomes the hover title
 * unless a shorter title is given.
 * @param {import('./icons.js').IconName} name
 * @param {string} ariaLabel
 * @param {(event: MouseEvent) => void} onClick
 * @param {{ variant?: string, className?: string, title?: string }} [opts]
 * variant maps to a `btn--*` modifier, for example 'danger' or 'success'.
 * @returns {HTMLButtonElement}
 */
export function iconButton(name, ariaLabel, onClick, opts = {}) {
  const classes = ['btn', 'btn--icon', opts.variant ? `btn--${opts.variant}` : '', opts.className];
  const button = el('button', classNames(classes), icon(name));
  setAttrs(button, { type: 'button', 'aria-label': ariaLabel, title: opts.title ?? ariaLabel });
  button.addEventListener('click', onClick);
  return button;
}

/**
 * A text `btn` button, with an optional leading icon. `ariaLabel` overrides
 * the accessible name when the visible label alone is ambiguous, for
 * example a weapon name whose action is "Attack with". A dialog's confirm
 * button passes `type: 'submit'` with the `value` the dialog reads back.
 * This makes an Escape dismissal, which leaves the value empty,
 * distinguishable from a confirm.
 * @param {string} label
 * @param {(event: MouseEvent) => void} [onClick] Omit onClick for a submit
 *   button. The dialog reads its return value instead of a listener.
 * @param {{ icon?: import('./icons.js').IconName, variant?: string, className?: string,
 *   title?: string, ariaLabel?: string, type?: 'button' | 'submit', value?: string }} [opts]
 * @returns {HTMLButtonElement}
 */
export function textButton(label, onClick, opts = {}) {
  const classes = ['btn', opts.variant ? `btn--${opts.variant}` : '', opts.className];
  const button = el('button', classNames(classes), opts.icon && icon(opts.icon), label);
  button.type = opts.type ?? 'button';
  if (opts.value !== undefined) button.value = opts.value;
  if (opts.ariaLabel) button.setAttribute('aria-label', opts.ariaLabel);
  if (opts.title) button.title = opts.title;
  if (onClick) button.addEventListener('click', onClick);
  return button;
}

/**
 * One choice in a `segSwitch`. A choice shows an icon, a label, or both. An
 * icon-only choice needs `ariaLabel` for its accessible name. This also
 * becomes the hover title unless `title` overrides it.
 * @template {string} T
 * @typedef {{ value: T, label?: string, icon?: import('./icons.js').IconName,
 *   ariaLabel?: string, title?: string }} SegOption
 */

/**
 * A segmented switch: a `role="group"` of buttons over one value. The
 * selected button carries both the active class and `aria-pressed`, so the
 * choice reads the same by eye and by screen reader. The header's mode,
 * role, and theme switches, and the dice tray's d20 mode, all use this shape.
 *
 * `setValue` selects a choice and reports it through `onChange`, the same
 * path a click takes. `sync` only repaints the buttons. Use sync when the
 * value lives elsewhere and can change without the switch, for example the
 * dice tray's selection, which a programmatic roll overwrites.
 * @template {string} T
 * @param {{ ariaLabel: string, options: SegOption<T>[], value: T,
 *   onChange: (value: T) => void, className?: string }} spec
 * @returns {{ element: HTMLDivElement, getValue: () => T,
 *   setValue: (value: T) => void, sync: (value?: T) => void }}
 */
export function segSwitch({ ariaLabel, options, value, onChange, className = '' }) {
  const element = el('div', classNames(['seg-switch', className]));
  setAttrs(element, { role: 'group', 'aria-label': ariaLabel });

  let current = value;

  const entries = options.map((option) => {
    const button = el(
      'button',
      'btn seg-switch__btn',
      option.icon && icon(option.icon),
      option.label,
    );
    button.type = 'button';
    if (option.ariaLabel) button.setAttribute('aria-label', option.ariaLabel);
    if (option.title ?? option.ariaLabel) button.title = option.title ?? option.ariaLabel ?? '';
    button.addEventListener('click', () => setValue(option.value));
    element.append(button);
    return { value: option.value, button };
  });

  /** @param {T} [next] */
  function sync(next) {
    if (next !== undefined) current = next;
    for (const entry of entries) {
      const active = entry.value === current;
      entry.button.classList.toggle('seg-switch__btn--active', active);
      entry.button.setAttribute('aria-pressed', String(active));
    }
  }

  /** @param {T} next */
  function setValue(next) {
    sync(next);
    onChange(next);
  }

  sync();
  return { element, getValue: () => current, setValue, sync };
}

/**
 * A small labeled tag. Examples are the status conditions on a sheet, the
 * effects a weapon inflicts, and the pills in a tag field. The label sits
 * in its own span, so a caller can append to the chip without changing the text.
 * @param {string} label
 * @param {{ className?: string }} [opts]
 * @returns {HTMLSpanElement}
 */
export function chip(label, opts = {}) {
  return el('span', classNames(['chip', opts.className]), el('span', '', label));
}

/**
 * A chip with a trailing x that removes it. `removeLabel` names the item
 * removed when the visible label is not the item itself. For example, the
 * conditions bar shows "Poisoned (3)" but removes "Poisoned".
 * @param {string} label
 * @param {() => void} onRemove
 * @param {{ className?: string, removeLabel?: string }} [opts]
 * @returns {HTMLSpanElement}
 */
export function removableChip(label, onRemove, opts = {}) {
  const remove = el('button', 'chip__remove', '×');
  remove.type = 'button';
  remove.setAttribute('aria-label', `Remove ${opts.removeLabel ?? label}`);
  remove.addEventListener('click', onRemove);
  const wrapper = chip(label, opts);
  wrapper.append(remove);
  return wrapper;
}

/**
 * The shared muted paragraph every panel shows when its list is empty. It
 * uses one class and one element shape everywhere.
 * @param {string} message
 * @returns {HTMLParagraphElement}
 */
export function emptyState(message) {
  return el('p', 'empty-state u-muted', message);
}
