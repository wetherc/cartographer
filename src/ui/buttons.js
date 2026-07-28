import { classNames, el, setAttrs } from './dom.js';
import { icon } from './icons.js';

/**
 * The two button idioms every panel builds: an icon-only square button and a
 * text button with an optional leading icon. Both were hand-rolled at ~40
 * sites before this module, with aria-label and title coverage drifting site
 * by site; building through these helpers keeps the accessibility surface
 * uniform. Destructive buttons pass `variant: 'danger'` — the app-wide rule
 * is that a delete control is always danger-styled and always visible.
 * `emptyState` rides along as the third panel-level primitive: the muted
 * "nothing here" paragraph every list panel shows, and `chip`/`removableChip`
 * as the fourth: the small labeled tag, with or without an x to drop it.
 * `segSwitch` builds the fifth, a segmented group of mutually exclusive
 * buttons.
 */

/**
 * An icon-only `btn btn--icon` button. The aria-label is required (icon-only
 * buttons have no other accessible name) and doubles as the hover title
 * unless a shorter one is given.
 * @param {import('./icons.js').IconName} name
 * @param {string} ariaLabel
 * @param {(event: MouseEvent) => void} onClick
 * @param {{ variant?: string, className?: string, title?: string }} [opts]
 * `variant` maps to a `btn--*` modifier (e.g. 'danger', 'success').
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
 * A text `btn` button, optionally led by an icon. `ariaLabel` overrides the
 * accessible name when the visible label alone is ambiguous (e.g. a weapon
 * name whose action is "Attack with …"). A dialog's confirm button passes
 * `type: 'submit'` with the `value` the dialog reads back, so an Escape
 * dismissal (which leaves the value empty) is distinguishable from a confirm.
 * @param {string} label
 * @param {(event: MouseEvent) => void} [onClick] omit for a submit button the
 *   dialog resolves through its return value rather than a listener
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
 * One choice in a `segSwitch`. A choice shows an icon, a label, or both; an
 * icon-only choice needs `ariaLabel` for its accessible name, which also
 * becomes the hover title unless `title` overrides it.
 * @template {string} T
 * @typedef {{ value: T, label?: string, icon?: import('./icons.js').IconName,
 *   ariaLabel?: string, title?: string }} SegOption
 */

/**
 * A segmented switch: a `role="group"` of buttons over one value, where the
 * selected button carries both the active class and `aria-pressed` so the
 * choice reads the same by eye and by screen reader. The header's mode, role,
 * and theme switches and the dice tray's d20 mode are all this shape.
 *
 * `setValue` selects a choice and reports it through `onChange`, the same path
 * a click takes. `sync` only repaints the buttons, for a caller whose value
 * lives elsewhere and can change without going through the switch (the dice
 * tray's selection, which a programmatic roll overwrites).
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
 * A small labeled tag: the status conditions on a sheet, the effects a weapon
 * inflicts, the pills in a tag field. The label goes in its own span so a
 * caller can append to the chip without disturbing the text.
 * @param {string} label
 * @param {{ className?: string }} [opts]
 * @returns {HTMLSpanElement}
 */
export function chip(label, opts = {}) {
  return el('span', classNames(['chip', opts.className]), el('span', '', label));
}

/**
 * A chip with a trailing x that drops it. `removeLabel` names what is being
 * removed when the visible label is not the thing itself (the conditions bar
 * shows "Poisoned (3)" but removes "Poisoned").
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
 * The shared muted "nothing here" paragraph every panel shows when its list
 * is empty. One class, one element shape, everywhere.
 * @param {string} message
 * @returns {HTMLParagraphElement}
 */
export function emptyState(message) {
  return el('p', 'empty-state', message);
}
