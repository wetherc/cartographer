import { mustGetElement } from '../ui/dom.js';

/**
 * Wires the Menu button of the header. The stylesheet shows the button only
 * at phone width, where it folds the header actions and view switches away.
 * A press on a button inside the menu runs that action and closes the menu,
 * and Escape or a click outside the header closes it too.
 *
 * A closed menu hides its buttons, so the button that has focus loses it and
 * the next Tab starts again from the skip links. The menu therefore moves
 * focus to the Menu button when it closes with focus inside it. An action
 * that opens a dialog moves focus into the dialog first, so the dialog keeps
 * it.
 */
export function wireHeaderMenu() {
  const header = /** @type {HTMLElement} */ (mustGetElement('header-menu').closest('header'));
  const button = mustGetElement('header-menu-btn');
  const menu = mustGetElement('header-menu');

  /** @param {boolean} open */
  function setOpen(open) {
    header.classList.toggle('app-header--menu-open', open);
    button.setAttribute('aria-expanded', String(open));
  }

  button.addEventListener('click', () => setOpen(button.getAttribute('aria-expanded') !== 'true'));
  menu.addEventListener('click', (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    if (!target.closest('button')) return;
    const active = document.activeElement;
    setOpen(false);
    if (!active || active === document.body || menu.contains(active)) button.focus();
  });
  header.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || button.getAttribute('aria-expanded') !== 'true') return;
    // The full sheet closes on an Escape that no other handler used, so a
    // key that closes the menu marks itself used and leaves the sheet open.
    event.preventDefault();
    setOpen(false);
    button.focus();
  });
  document.addEventListener('pointerdown', (event) => {
    if (!header.contains(/** @type {Node} */ (event.target))) setOpen(false);
  });
}
