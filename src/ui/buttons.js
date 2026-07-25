import { icon } from './icons.js';

/**
 * The two button idioms every panel builds: an icon-only square button and a
 * text button with an optional leading icon. Both were hand-rolled at ~40
 * sites before this module, with aria-label and title coverage drifting site
 * by site; building through these helpers keeps the accessibility surface
 * uniform. Destructive buttons pass `variant: 'danger'` — the app-wide rule
 * is that a delete control is always danger-styled and always visible.
 * `emptyState` rides along as the third panel-level primitive: the muted
 * "nothing here" paragraph every list panel shows.
 */

/**
 * @param {string[]} parts
 * @returns {string}
 */
function classNames(parts) {
  return parts.filter(Boolean).join(' ');
}

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
  const button = document.createElement('button');
  button.type = 'button';
  button.className = classNames([
    'btn',
    'btn--icon',
    opts.variant ? `btn--${opts.variant}` : '',
    opts.className ?? '',
  ]);
  button.setAttribute('aria-label', ariaLabel);
  button.title = opts.title ?? ariaLabel;
  button.appendChild(icon(name));
  button.addEventListener('click', onClick);
  return button;
}

/**
 * A text `btn` button, optionally led by an icon. `ariaLabel` overrides the
 * accessible name when the visible label alone is ambiguous (e.g. a weapon
 * name whose action is "Attack with …").
 * @param {string} label
 * @param {(event: MouseEvent) => void} onClick
 * @param {{ icon?: import('./icons.js').IconName, variant?: string, className?: string,
 *   title?: string, ariaLabel?: string }} [opts]
 * @returns {HTMLButtonElement}
 */
export function textButton(label, onClick, opts = {}) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = classNames([
    'btn',
    opts.variant ? `btn--${opts.variant}` : '',
    opts.className ?? '',
  ]);
  if (opts.ariaLabel) button.setAttribute('aria-label', opts.ariaLabel);
  if (opts.title) button.title = opts.title;
  if (opts.icon) button.appendChild(icon(opts.icon));
  button.appendChild(document.createTextNode(label));
  button.addEventListener('click', onClick);
  return button;
}

/**
 * The shared muted "nothing here" paragraph every panel shows when its list
 * is empty. One class, one element shape, everywhere.
 * @param {string} message
 * @returns {HTMLParagraphElement}
 */
export function emptyState(message) {
  const el = document.createElement('p');
  el.className = 'empty-state';
  el.textContent = message;
  return el;
}
