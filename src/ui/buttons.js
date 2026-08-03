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
 * segmented group of buttons where only one choice is active. bareButton is
 * a sixth: a control that is a button for the keyboard and the screen reader
 * but wears no button chrome. badge and sectionLabel round the set out.
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
 * A control that is a button for the keyboard and the screen reader but wears
 * no button chrome: a breadcrumb crumb, a disclosure header, a tree row, a
 * menu item, a spell-slot pip. `.btn-bare` strips the browser's button
 * presentation back to the surrounding text, and the class the caller passes
 * supplies whatever look the control does have.
 *
 * The children are the button's content, so a caller can nest an icon and a
 * label without a second builder. A control whose visible text is not its
 * accessible name, an icon-only one above all, passes `ariaLabel`.
 * @param {import('./dom.js').Child[]} children
 * @param {(event: MouseEvent) => void} [onClick] Omit for a button another
 *   helper wires, for example a disclosure header.
 * @param {{ className?: string, ariaLabel?: string, title?: string }} [opts]
 * @returns {HTMLButtonElement}
 */
export function bareButton(children, onClick, opts = {}) {
  const button = el('button', classNames(['btn-bare', opts.className]), ...children);
  button.type = 'button';
  if (opts.ariaLabel) button.setAttribute('aria-label', opts.ariaLabel);
  if (opts.title) button.title = opts.title;
  if (onClick) button.addEventListener('click', onClick);
  return button;
}

/**
 * A read-only status marker on a list row: a library entry's source, an NPC's
 * disposition, a spell's known-or-prepared state. `variant` covers the three
 * shared readings, `success`, `danger`, and `neutral`. A marker that means
 * something outside that scale passes its own class instead.
 * @param {string} label
 * @param {{ variant?: 'success' | 'danger' | 'neutral', className?: string }} [opts]
 * @returns {HTMLSpanElement}
 */
export function badge(label, opts = {}) {
  const classes = ['badge', opts.variant ? `badge--${opts.variant}` : '', opts.className];
  return el('span', classNames(classes), label);
}

/**
 * The sub-heading inside a panel section: a spell group, a quest group, a
 * palette section, a block of sheet fields. A heading that a screen reader
 * should reach through the document outline passes `tag: 'h3'`; the rest stay
 * spans, since they label the box beside them rather than open a section.
 * @param {string} text
 * @param {{ tag?: 'span' | 'h3' | 'h4', className?: string }} [opts]
 * @returns {HTMLElement}
 */
export function sectionLabel(text, opts = {}) {
  return el(opts.tag ?? 'span', classNames(['section-label', opts.className]), text);
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
 *
 * A chip that does something on click, a stat chip that opens its editor for
 * example, passes `onClick`. That makes the chip a real `<button>`, which is
 * what puts it in the tab order and gives it a button role. The tag follows
 * from the option, so there is no way to build a chip that looks clickable and
 * is not, or a button with no handler. A chip button also carries `.btn-bare`,
 * which clears the browser's button font and padding before `.chip` applies
 * the chip's own.
 * @param {string} label
 * @param {{ className?: string, onClick?: (event: MouseEvent) => void,
 *   ariaLabel?: string, title?: string }} [opts]
 * @returns {HTMLElement}
 */
export function chip(label, opts = {}) {
  if (!opts.onClick) return el('span', classNames(['chip', opts.className]), el('span', '', label));

  const classes = classNames(['btn-bare', 'chip', opts.className]);
  const button = el('button', classes, el('span', '', label));
  button.type = 'button';
  if (opts.ariaLabel) button.setAttribute('aria-label', opts.ariaLabel);
  if (opts.title) button.title = opts.title;
  button.addEventListener('click', opts.onClick);
  return button;
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
