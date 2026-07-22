import { icon } from './icons.js';

/**
 * Mount the on-canvas map controls: zoom in/out, fit-to-extent, and a live
 * zoom-percentage readout. Nothing on the map otherwise advertises that it
 * pans and zooms, and these buttons give keyboard users a reachable
 * alternative to the wheel-only zoom.
 * @param {HTMLElement} container
 * @param {{
 *   onZoomIn: () => void,
 *   onZoomOut: () => void,
 *   onFit: () => void,
 *   getZoom: () => number,
 * }} callbacks
 * @returns {{ update: () => void }}
 */
export function mountMapControls(container, callbacks) {
  const root = document.createElement('div');
  root.className = 'map-controls';
  container.appendChild(root);

  /**
   * @param {import('./icons.js').IconName} name
   * @param {string} label
   * @param {() => void} onClick
   */
  function button(name, label, onClick) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'btn btn--icon map-controls__btn';
    el.setAttribute('aria-label', label);
    el.title = label;
    el.appendChild(icon(name));
    el.addEventListener('click', onClick);
    return el;
  }

  const readout = document.createElement('span');
  readout.className = 'map-controls__zoom';
  readout.setAttribute('aria-live', 'off');

  function update() {
    readout.textContent = `${Math.round(callbacks.getZoom() * 100)}%`;
  }

  root.append(
    button('plus', 'Zoom in', callbacks.onZoomIn),
    button('minus', 'Zoom out', callbacks.onZoomOut),
    button('fit', 'Fit map to view', callbacks.onFit),
    readout,
  );
  update();
  return { update };
}
