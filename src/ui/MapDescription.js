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

  let last = '';

  return {
    update(node, party, revealAll) {
      const text = node ? describeNode(node, party, { revealAll }) : '';
      // Only write when the narration actually changed. Assigning textContent
      // replaces the live region's text node, which is what a screen reader
      // watches, so an unconditional write re-announces the whole description on
      // events that did not change a word of it — a paint stroke that only swaps
      // tile art, or a party step within an already-explored area.
      if (text === last) return;
      last = text;
      el.textContent = text;
    },
  };
}
