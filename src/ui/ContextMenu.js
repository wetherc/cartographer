/**
 * A small floating menu anchored to a screen position. It is the right-click
 * counterpart to Modal.js, for choices that do not need a full dialog. It
 * follows native-menu behavior: focus moves to the first item, arrow keys
 * cycle through items, and Escape or a click outside the menu dismisses it
 * without a choice. Choosing an item closes the menu before it runs the
 * action. Only one menu stays open at a time. Opening another menu closes
 * the first.
 */

import { bareButton } from './buttons.js';
import { el } from './dom.js';

/**
 * Clamp a menu's top-left corner so the whole menu stays inside the
 * viewport. This flips the menu off an edge rather than sliding it under
 * the edge.
 *
 * The bounds here do not read as `util/num.js` `clamp` does. A menu taller or
 * wider than the viewport has an upper bound below the margin. This code keeps
 * the margin in that case, so the first items stay on screen. `clamp` keeps the
 * upper bound instead, which would push the top-left corner off screen.
 * @param {number} x @param {number} y desired position, for example the pointer position
 * @param {number} width @param {number} height menu size
 * @param {number} viewportWidth @param {number} viewportHeight
 * @param {number} [margin] minimum gap kept from every viewport edge
 * @returns {{ x: number, y: number }}
 */
export function clampToViewport(x, y, width, height, viewportWidth, viewportHeight, margin = 4) {
  return {
    x: Math.max(margin, Math.min(x, viewportWidth - width - margin)),
    y: Math.max(margin, Math.min(y, viewportHeight - height - margin)),
  };
}

/** @type {(() => void) | null} */
let closeCurrent = null;
/** The menu button of the open menu, or null for a menu opened at a pointer.
 * @type {HTMLElement | null} */
let openTrigger = null;

/**
 * Open the context menu at a screen position. This function returns nothing.
 * Selection and dismissal both resolve through each item's own callback, or
 * through no callback at all.
 * @param {{ label: string, onSelect: () => void, danger?: boolean }[]} items an item with
 *   `danger` deletes or discards something, and draws in the danger colour
 * @param {{ clientX: number, clientY: number }} position
 * @param {HTMLElement | null} [trigger] the menu button that opened the menu.
 *   It gets `aria-expanded` while the menu is open, and its accessible name
 *   names the menu. A press on it does not count as a press outside.
 * @param {string} [label] the accessible name of a menu opened with no menu
 *   button, for example by a right-click on a world-tree row
 */
export function openContextMenu(items, position, trigger = null, label = undefined) {
  closeCurrent?.();
  if (items.length === 0) return;

  // Return focus to the previously focused element when the menu closes.
  // This matches Modal.js.
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  const menu = el('div', 'context-menu u-col');
  menu.setAttribute('role', 'menu');
  const name = trigger?.getAttribute('aria-label') ?? label;
  if (name) menu.setAttribute('aria-label', name);

  const buttons = items.map((item) => {
    const button = bareButton(
      [item.label],
      () => {
        close();
        item.onSelect();
      },
      {
        className: item.danger
          ? 'context-menu__item context-menu__item--danger'
          : 'context-menu__item',
      },
    );
    button.setAttribute('role', 'menuitem');
    menu.appendChild(button);
    return button;
  });

  function close() {
    document.removeEventListener('pointerdown', onOutsidePointer, true);
    menu.remove();
    closeCurrent = null;
    openTrigger = null;
    trigger?.setAttribute('aria-expanded', 'false');
    opener?.focus();
  }

  /** Any pointer press outside the menu dismisses it. This listener uses the
   * capture phase, so it closes the menu even when another widget stops
   * event propagation.
   * @param {PointerEvent} event */
  function onOutsidePointer(event) {
    const target = event.target instanceof Node ? event.target : null;
    // A press on the menu button leaves the menu to the click that follows,
    // which closes it in toggleMenuFrom. Closing here too would let that
    // click open the menu again.
    if (target && (menu.contains(target) || trigger?.contains(target))) return;
    close();
  }

  menu.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      close();
      return;
    }
    const moves = { ArrowDown: 1, ArrowUp: -1, Home: 0, End: 0 };
    if (!(event.key in moves)) return;
    event.preventDefault();
    const current = buttons.indexOf(/** @type {HTMLButtonElement} */ (document.activeElement));
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? buttons.length - 1
          : (current + moves[/** @type {'ArrowDown' | 'ArrowUp'} */ (event.key)] + buttons.length) %
            buttons.length;
    buttons[next].focus();
  });

  document.addEventListener('pointerdown', onOutsidePointer, true);
  document.body.appendChild(menu);
  closeCurrent = close;
  openTrigger = trigger;
  trigger?.setAttribute('aria-expanded', 'true');

  // Position the menu after mounting it, so the clamp can measure its real
  // size.
  const rect = menu.getBoundingClientRect();
  const spot = clampToViewport(
    position.clientX,
    position.clientY,
    rect.width,
    rect.height,
    window.innerWidth,
    window.innerHeight,
  );
  menu.style.left = `${spot.x}px`;
  menu.style.top = `${spot.y}px`;
  buttons[0].focus();
}

/**
 * Open the menu of a menu button below the button, or close it when that
 * button's menu is already open. A second press on the button then closes
 * the menu, as a native menu button does.
 * @param {HTMLElement} trigger
 * @param {{ label: string, onSelect: () => void, danger?: boolean }[]} items
 */
export function toggleMenuFrom(trigger, items) {
  if (openTrigger === trigger) {
    closeCurrent?.();
    return;
  }
  const rect = trigger.getBoundingClientRect();
  openContextMenu(items, { clientX: rect.left, clientY: rect.bottom }, trigger);
}

/**
 * Mark a button as the opener of a menu: `aria-haspopup="menu"`, and
 * `aria-expanded="false"` until toggleMenuFrom opens its menu.
 * @param {HTMLElement} button
 */
export function markMenuButton(button) {
  button.setAttribute('aria-haspopup', 'menu');
  button.setAttribute('aria-expanded', 'false');
}
