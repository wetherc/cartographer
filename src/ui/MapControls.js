import { iconButton } from './buttons.js';

/**
 * Mount the on-canvas map controls: zoom in/out, fit-to-extent, and a live
 * zoom-percentage readout. Nothing on the map otherwise advertises that it
 * pans and zooms, and these buttons give keyboard users a reachable
 * alternative to the wheel-only zoom.
 * With a `fog` group, a second GM-only cluster offers a reveal brush, a hide
 * brush (toggles — strokes on the map then reveal/hide fog instead of moving
 * the party), and a reveal-whole-node action. The caller owns the active-tool
 * state; `getTool` drives the pressed styling.
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
  const root = document.createElement('div');
  root.className = 'map-controls';
  container.appendChild(root);

  /**
   * @param {import('./icons.js').IconName} name
   * @param {string} label
   * @param {() => void} onClick
   */
  const button = (name, label, onClick) =>
    iconButton(name, label, onClick, { className: 'map-controls__btn' });

  const readout = document.createElement('span');
  readout.className = 'map-controls__zoom';
  readout.setAttribute('aria-live', 'off');

  /** @type {{ el: HTMLButtonElement, tool: 'reveal' | 'hide' }[]} */
  const fogToggles = [];

  /** @type {string} */
  let lastZoom = '';
  /** @type {'reveal' | 'hide' | null | undefined} */
  let lastTool;

  // Called from the canvas's per-frame view-change hook, so bail before any
  // DOM write when nothing shown here changed — a pan otherwise rewrites the
  // readout and toggle attributes at frame rate.
  function update() {
    const zoom = `${Math.round(callbacks.getZoom() * 100)}%`;
    const active = callbacks.fog?.getTool() ?? null;
    if (zoom === lastZoom && active === lastTool) return;
    lastZoom = zoom;
    lastTool = active;
    readout.textContent = zoom;
    for (const { el, tool } of fogToggles) {
      el.classList.toggle('map-controls__btn--active', active === tool);
      el.setAttribute('aria-pressed', String(active === tool));
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
    const cluster = document.createElement('span');
    cluster.className = 'map-controls__fog';
    /** @param {'reveal' | 'hide'} tool @param {import('./icons.js').IconName} name @param {string} label */
    const toggle = (tool, name, label) => {
      const el = button(name, label, () => {
        fog.onToolChange(fog.getTool() === tool ? null : tool);
        update();
      });
      fogToggles.push({ el, tool });
      return el;
    };
    cluster.append(
      toggle('reveal', 'eye', 'Reveal fog (brush)'),
      toggle('hide', 'eye-off', 'Hide fog (brush)'),
      button('map', 'Reveal whole area', fog.onRevealAll),
    );
    root.appendChild(cluster);
  }

  update();
  return { update };
}
