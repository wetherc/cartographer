/**
 * A small floating menu anchored to a screen position. It is the right-click
 * counterpart to Modal.js, for choices that do not need a full dialog. It
 * follows native-menu behavior: focus moves to the first item, arrow keys
 * cycle through items, and Escape or a click outside the menu dismisses it
 * without a choice. Choosing an item closes the menu before it runs the
 * action. Only one menu stays open at a time. Opening another menu closes
 * the first.
 */

import { el } from './dom.js';

/**
 * Clamp a menu's top-left corner so the whole menu stays inside the
 * viewport. This flips the menu off an edge rather than sliding it under
 * the edge.
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

/**
 * Open the context menu at a screen position. This function returns nothing.
 * Selection and dismissal both resolve through each item's own callback, or
 * through no callback at all.
 * @param {{ label: string, onSelect: () => void }[]} items
 * @param {{ clientX: number, clientY: number }} position
 */
export function openContextMenu(items, position) {
  closeCurrent?.();
  if (items.length === 0) return;

  // Return focus to the previously focused element when the menu closes.
  // This matches Modal.js.
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  const menu = el('div', 'context-menu u-col');
  menu.setAttribute('role', 'menu');

  const buttons = items.map((item) => {
    const button = el('button', 'context-menu__item', item.label);
    button.type = 'button';
    button.setAttribute('role', 'menuitem');
    button.addEventListener('click', () => {
      close();
      item.onSelect();
    });
    menu.appendChild(button);
    return button;
  });

  function close() {
    document.removeEventListener('pointerdown', onOutsidePointer, true);
    menu.remove();
    closeCurrent = null;
    opener?.focus();
  }

  /** Any pointer press outside the menu dismisses it. This listener uses the
   * capture phase, so it closes the menu even when another widget stops
   * event propagation.
   * @param {PointerEvent} event */
  function onOutsidePointer(event) {
    if (!(event.target instanceof Node) || !menu.contains(event.target)) close();
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
