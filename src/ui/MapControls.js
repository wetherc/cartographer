import { iconButton } from './buttons.js';
import { el } from './dom.js';

/**
 * Mount the on-canvas map controls: zoom in, zoom out, fit-to-extent, and
 * a live zoom-percentage readout. Nothing else on the map shows that it
 * pans and zooms, so these buttons give keyboard users a reachable
 * alternative to the wheel-only zoom.
 * If a `fog` group is set, a second GM-only cluster offers a reveal
 * brush, a hide brush, toggles that make a stroke on the map reveal or
 * hide fog instead of moving the party, and a reveal-whole-node action.
 * The caller owns the active-tool state. `getTool` drives the pressed styling.
 * @param {HTMLElement} container
 * @param {{
 *   onZoomIn: () => void,
 *   onZoomOut: () => void,
 *   onFit: () => void,
 *   getZoom: () => number,
 *   fog?: {
 *     getTool: () => 'reveal' | 'hide' | null,
 *     onToolChange: (tool: 'reveal' | 'hide' | null) => void,
 *     onRevealAll: () => void,
 *   },
 * }} callbacks
 * @returns {{ update: () => void }}
 */
export function mountMapControls(container, callbacks) {
  const root = el('div', 'map-controls u-row u-g1');
  container.appendChild(root);

  /**
   * @param {import('./icons.js').IconName} name
   * @param {string} label
   * @param {() => void} onClick
   */
  const button = (name, label, onClick) =>
    iconButton(name, label, onClick, { className: 'map-controls__btn' });

  const readout = el('span', 'map-controls__zoom');
  readout.setAttribute('aria-live', 'off');

  /** @type {{ el: HTMLButtonElement, tool: 'reveal' | 'hide' }[]} */
  const fogToggles = [];

  /** @type {string} */
  let lastZoom = '';
  /** @type {'reveal' | 'hide' | null | undefined} */
  let lastTool;

  // This runs from the canvas's per-frame view-change hook. Stop before
  // any DOM write when nothing shown here changed. Otherwise a pan
  // rewrites the readout and toggle attributes at frame rate.
  function update() {
    const zoom = `${Math.round(callbacks.getZoom() * 100)}%`;
    const active = callbacks.fog?.getTool() ?? null;
    if (zoom === lastZoom && active === lastTool) return;
    lastZoom = zoom;
    lastTool = active;
    readout.textContent = zoom;
    for (const { el: btn, tool } of fogToggles) {
      btn.classList.toggle('map-controls__btn--active', active === tool);
      btn.setAttribute('aria-pressed', String(active === tool));
    }
  }

  root.append(
    button('plus', 'Zoom in', callbacks.onZoomIn),
    button('minus', 'Zoom out', callbacks.onZoomOut),
    button('fit', 'Fit map to view', callbacks.onFit),
    readout,
  );

  const fog = callbacks.fog;
  if (fog) {
    /** @param {'reveal' | 'hide'} tool @param {import('./icons.js').IconName} name @param {string} label */
    const toggle = (tool, name, label) => {
      const btn = button(name, label, () => {
        fog.onToolChange(fog.getTool() === tool ? null : tool);
        update();
      });
      fogToggles.push({ el: btn, tool });
      return btn;
    };
    const cluster = el(
      'span',
      'map-controls__fog',
      toggle('reveal', 'eye', 'Reveal fog (brush)'),
      toggle('hide', 'eye-off', 'Hide fog (brush)'),
      button('map', 'Reveal whole area', fog.onRevealAll),
    );
    root.appendChild(cluster);
  }

  update();
  return { update };
}
