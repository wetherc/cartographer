import { textButton } from './buttons.js';
import { el } from './dom.js';
import { exitDescription } from '../map/MapExits.js';

/** @typedef {import('../types/map.js').MapExit} MapExit */

/**
 * Mount the map's ways out as real buttons over the viewport. The return
 * arrows themselves draw on the canvas. Assistive tech cannot read canvas
 * pixels, and only a pointer or the cursor keys can reach its bands.
 * These buttons give the same travel to a keyboard and a screen reader,
 * and they are the only affordance a `fallback` exit has at all.
 *
 * The list stays hidden until one of the buttons takes focus, so the map
 * art stays untouched for everyone else. Tabbing past the canvas brings
 * the list into view. Tabbing on hides it again. Hiding happens on the
 * container rather than per button, so the buttons stay in one flex row
 * and appearing costs one reflow instead of one per button. The one
 * exception is a fallback-only list, which stays pinned open. The canvas
 * draws no arrow and no badge for a fallback exit, so without the pin a
 * pointer user in a sealed interior sees no way out at all.
 *
 * @param {HTMLElement} container the map viewport (position: relative)
 * @param {(exit: MapExit) => void} onExit
 * @returns {{ update: (exits: MapExit[]) => void }}
 */
export function mountExitList(container, onExit) {
  const root = el('nav', 'map-exits');
  root.setAttribute('aria-label', 'Ways out of this area');
  container.appendChild(root);

  /** @type {string} the rendered exits, so update leaves an unchanged list alone */
  let lastKey = '';

  /** @param {MapExit[]} exits */
  function update(exits) {
    const key = exits.map(exitDescription).join('|');
    // This runs on every navigation and party move. Rebuilding the
    // buttons each time drops focus out of the list mid-tab.
    if (key === lastKey) return;
    lastKey = key;
    // A change can still land while a button holds focus, since the exits
    // recompute as the party moves. Clearing drops focus to the body
    // and collapses the list mid-tab, so focus moves to the first
    // surviving button instead.
    const hadFocus = root.contains(document.activeElement);
    root.textContent = '';
    for (const exit of exits) {
      root.appendChild(
        textButton(exitDescription(exit), () => onExit(exit), { className: 'map-exits__btn' }),
      );
    }
    root.classList.toggle(
      'map-exits--pinned',
      exits.length > 0 && exits.every((exit) => exit.kind === 'fallback'),
    );
    if (hadFocus) root.querySelector('button')?.focus();
  }

  update([]);
  return { update };
}
