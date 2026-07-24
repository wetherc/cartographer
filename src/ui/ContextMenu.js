/**
 * A small floating menu anchored to a screen position — the right-click
 * counterpart to Modal.js, for choices that don't warrant a full dialog.
 * Native-menu semantics: focus moves into the first item, arrows cycle,
 * Escape or clicking anywhere outside dismisses without choosing, and
 * choosing an item closes the menu before running its action. At most one
 * menu is open at a time; opening another closes the first.
 */

/**
 * Clamp a menu's top-left corner so the whole menu stays inside the viewport,
 * flipping off the edges rather than sliding under them.
 * @param {number} x @param {number} y desired position (e.g. the pointer)
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
 * Open the context menu at a screen position. No return value: selection and
 * dismissal both resolve through the items' own callbacks (or nothing).
 * @param {{ label: string, onSelect: () => void }[]} items
 * @param {{ clientX: number, clientY: number }} position
 */
export function openContextMenu(items, position) {
  closeCurrent?.();
  if (items.length === 0) return;

  // Return focus to whatever had it once the menu closes, matching Modal.js.
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.setAttribute('role', 'menu');

  const buttons = items.map((item) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'context-menu__item';
    button.setAttribute('role', 'menuitem');
    button.textContent = item.label;
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

  /** Any press outside the menu dismisses it (capture phase, so a click on
   * another widget closes the menu even if that widget stops propagation).
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

  // Position after mounting so the real size is measurable for the clamp.
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
