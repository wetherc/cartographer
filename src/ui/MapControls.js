import { iconButton } from './buttons.js';
import { append, el } from './dom.js';
import { setTip } from './Tooltip.js';

const MINI_MAP_LABEL = 'Mini-map of the parent map';
const MINI_MAP_NONE = 'No mini-map: this map has no parent map that links to it';

/**
 * Mount the on-canvas map controls: zoom in, zoom out, fit-to-extent, center on
 * the party, and a live zoom-percentage readout. Nothing else on the map shows that it
 * pans and zooms, so these buttons give keyboard users a reachable
 * alternative to the wheel-only zoom.
 * If a `fog` group is set, a second GM-only cluster offers a reveal
 * brush, a hide brush, toggles that make a stroke on the map reveal or
 * hide fog instead of moving the party, and a reveal-whole-node action.
 * The caller owns the active-tool state. `getTool` drives the pressed styling.
 * If `miniMap` is set, a toggle shows or hides the mini-map of the parent
 * map. The caller owns that choice too, and `isOpen` drives the pressed state.
 * While `isAvailable` is false, the toggle is marked disabled with
 * aria-disabled, so it stays focusable and its tooltip says why.
 * @param {HTMLElement} container
 * @param {{
 *   onZoomIn: () => void,
 *   onZoomOut: () => void,
 *   onFit: () => void,
 *   onCenter: () => void,
 *   getZoom: () => number,
 *   fog?: {
 *     getTool: () => 'reveal' | 'hide' | null,
 *     onToolChange: (tool: 'reveal' | 'hide' | null) => void,
 *     onRevealAll: () => void,
 *   },
 *   miniMap?: { isOpen: () => boolean, isAvailable: () => boolean, onToggle: () => void },
 * }} callbacks
 * @returns {{ update: () => void, element: HTMLDivElement }}
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
  /** @type {boolean | undefined} */
  let lastMiniMap;
  /** @type {boolean | undefined} */
  let lastAvailable;

  /** @param {HTMLButtonElement} btn @param {boolean} pressed */
  const setPressed = (btn, pressed) => {
    btn.classList.toggle('map-controls__btn--active', pressed);
    btn.setAttribute('aria-pressed', String(pressed));
  };

  const miniMap = callbacks.miniMap;
  const miniMapToggle = miniMap
    ? button('minimap', MINI_MAP_LABEL, () => {
        if (!miniMap.isAvailable()) return;
        miniMap.onToggle();
        update();
      })
    : null;

  // This runs from the canvas's per-frame view-change hook. Stop before
  // any DOM write when nothing shown here changed. Otherwise a pan
  // rewrites the readout and toggle attributes at frame rate.
  function update() {
    const zoom = `${Math.round(callbacks.getZoom() * 100)}%`;
    const active = callbacks.fog?.getTool() ?? null;
    const miniMapOpen = miniMap?.isOpen();
    const available = miniMap?.isAvailable();
    if (
      zoom === lastZoom &&
      active === lastTool &&
      miniMapOpen === lastMiniMap &&
      available === lastAvailable
    )
      return;
    lastZoom = zoom;
    lastTool = active;
    lastMiniMap = miniMapOpen;
    lastAvailable = available;
    readout.textContent = zoom;
    for (const { el: btn, tool } of fogToggles) setPressed(btn, active === tool);
    if (miniMapToggle) {
      setPressed(miniMapToggle, Boolean(miniMapOpen && available));
      miniMapToggle.setAttribute('aria-disabled', String(!available));
      setTip(miniMapToggle, available ? MINI_MAP_LABEL : MINI_MAP_NONE);
    }
  }

  append(root, [
    button('plus', 'Zoom in', callbacks.onZoomIn),
    button('minus', 'Zoom out', callbacks.onZoomOut),
    button('fit', 'Fit map to view', callbacks.onFit),
    button('target', 'Center on party', callbacks.onCenter),
    miniMapToggle,
    readout,
  ]);

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
  return { update, element: root };
}
