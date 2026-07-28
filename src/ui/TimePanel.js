import { formatClock } from '../time/GameClock.js';
import { el } from './dom.js';
import { icon } from './icons.js';
import { textButton } from './buttons.js';

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
  const root = el('div', 'time-panel');
  container.appendChild(root);

  /** Every control here changes the clock, so each one re-renders the readout.
   * @param {string} label @param {() => void} onClick @param {import('./icons.js').IconName} [glyph] */
  const button = (label, onClick, glyph) =>
    textButton(
      label,
      () => {
        onClick();
        render();
      },
      { icon: glyph, className: 'time-panel__btn' },
    );

  function render() {
    root.innerHTML = '';
    root.append(
      el('div', 'time-panel__readout', icon('clock'), formatClock(callbacks.getClock())),
      el(
        'div',
        'time-panel__actions',
        button('Advance', callbacks.onAdvance),
        button('Short rest', callbacks.onShortRest),
        button('Long rest', callbacks.onLongRest),
      ),
    );
  }

  render();
  return { update: render };
}
