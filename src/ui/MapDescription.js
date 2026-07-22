import { describeNode } from '../map/MapDescription.js';

/** @typedef {import('../types/map.js').MapNode} MapNode */
/** @typedef {import('../types/map.js').PartyPosition} PartyPosition */

/**
 * A visually-hidden live region that narrates the map <canvas> for screen
 * readers, since the canvas pixels are opaque to assistive tech. Kept in sync
 * by the caller (main.js) on the same events that redraw the map. Uses
 * aria-live="polite" so updates are announced without interrupting.
 * @param {HTMLElement} container
 * @returns {{ update: (node: MapNode | null, party: PartyPosition | null, revealAll: boolean) => void }}
 */
export function mountMapDescription(container) {
  const el = document.createElement('div');
  el.className = 'sr-only';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  container.appendChild(el);

  return {
    update(node, party, revealAll) {
      el.textContent = node ? describeNode(node, party, { revealAll }) : '';
    },
  };
}
