import { textButton } from './buttons.js';
import { el } from './dom.js';
import { exitDescription } from '../map/MapExits.js';

/** @typedef {import('../types/map.js').MapExit} MapExit */

/**
 * Mount the map's ways out as real buttons over the viewport. The return arrows
 * themselves are drawn on the canvas, whose pixels assistive tech cannot read
 * and whose bands only a pointer or the cursor keys can reach; these buttons are
 * the same travel for a keyboard and a screen reader, and they are the only
 * affordance a `fallback` exit has at all.
 *
 * Hidden until one of them takes focus, so the map art is untouched for everyone
 * else: tabbing past the canvas brings the list into view, tabbing on hides it
 * again. Hiding happens on the container rather than per button, so the buttons
 * stay in one flex row and appearing costs one reflow instead of one per button.
 *
 * @param {HTMLElement} container the map viewport (position: relative)
 * @param {(exit: MapExit) => void} onExit
 * @returns {{ update: (exits: MapExit[]) => void }}
 */
export function mountExitList(container, onExit) {
  const root = el('nav', 'map-exits');
  root.setAttribute('aria-label', 'Ways out of this area');
  container.appendChild(root);

  /** @type {string} the rendered exits, so an unchanged list is left alone */
  let lastKey = '';

  /** @param {MapExit[]} exits */
  function update(exits) {
    const key = exits.map(exitDescription).join('|');
    // Called on every navigation and party move; rebuilding the buttons each
    // time would drop focus out of the list mid-tab.
    if (key === lastKey) return;
    lastKey = key;
    root.textContent = '';
    for (const exit of exits) {
      root.appendChild(
        textButton(exitDescription(exit), () => onExit(exit), { className: 'map-exits__btn' }),
      );
    }
  }

  update([]);
  return { update };
}
