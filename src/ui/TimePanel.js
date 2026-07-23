import { formatClock } from '../time/GameClock.js';
import { icon } from './icons.js';

/** @typedef {import('../types/time.js').GameClock} GameClock */

/**
 * Mount the in-game clock: a "Day N, Watch" readout with controls to advance
 * one watch and to take a short or long rest. The panel owns no state — it
 * reads the clock via `getClock` and every button calls back so the caller
 * advances time and applies rest recovery to the party.
 * @param {HTMLElement} container
 * @param {{
 *   getClock: () => GameClock,
 *   onAdvance: () => void,
 *   onShortRest: () => void,
 *   onLongRest: () => void,
 * }} callbacks
 * @returns {{ update: () => void }}
 */
export function mountTimePanel(container, callbacks) {
  const root = document.createElement('div');
  root.className = 'time-panel';
  container.appendChild(root);

  /** @param {string} label @param {() => void} onClick @param {import('./icons.js').IconName} [glyph] */
  function button(label, onClick, glyph) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn time-panel__btn';
    if (glyph) btn.appendChild(icon(glyph));
    btn.appendChild(document.createTextNode(label));
    btn.addEventListener('click', () => {
      onClick();
      render();
    });
    return btn;
  }

  function render() {
    root.innerHTML = '';
    const readout = document.createElement('div');
    readout.className = 'time-panel__readout';
    readout.append(icon('clock'), document.createTextNode(formatClock(callbacks.getClock())));
    root.appendChild(readout);

    const actions = document.createElement('div');
    actions.className = 'time-panel__actions';
    actions.append(
      button('Advance', callbacks.onAdvance),
      button('Short rest', callbacks.onShortRest),
      button('Long rest', callbacks.onLongRest),
    );
    root.appendChild(actions);
  }

  render();
  return { update: render };
}
