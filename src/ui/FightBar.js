import { textButton } from './buttons.js';
import { el } from './dom.js';
import { icon } from './icons.js';

/**
 * The bar above the Play map while a fight runs. It names the round and
 * whose turn it is, and its button returns to the combat screen. Without it,
 * the only way back from the map is the Initiative card in the sidebar. The
 * bar is hidden while no fight runs. `aria-live` announces a new turn to a
 * screen reader user who stays on the map.
 * @param {HTMLElement} container the element the bar goes first in
 * @param {{ getStatus: () => string | null, onReturn: () => void }} callbacks
 *   `getStatus` returns null while no fight runs
 * @returns {{ element: HTMLElement, update: () => void }}
 */
export function mountFightBar(container, callbacks) {
  const text = el('span', 'fight-bar__status');
  text.setAttribute('aria-live', 'polite');
  const element = el(
    'div',
    'fight-bar',
    el('span', 'fight-bar__mark', icon('sword')),
    text,
    textButton('Return to fight', callbacks.onReturn, {
      variant: 'primary',
      className: 'fight-bar__return',
    }),
  );
  element.setAttribute('role', 'region');
  element.setAttribute('aria-label', 'Fight in progress');
  container.prepend(element);

  function update() {
    const status = callbacks.getStatus();
    element.hidden = status === null;
    const line = status === null ? '' : `Fight in progress. ${status}`;
    if (text.textContent !== line) text.textContent = line;
  }

  update();
  return { element, update };
}
