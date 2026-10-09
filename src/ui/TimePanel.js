import { formatClock, formatWatchProgress, MINUTES_PER_WATCH } from '../time/GameClock.js';
import { el } from './dom.js';
import { icon } from './icons.js';
import { textButton } from './buttons.js';
import { setTip } from './Tooltip.js';

/** @typedef {import('../types/time.js').GameClock} GameClock */

/** The tooltip of each button while time can pass. Advance leaves the minutes
 * spent in the watch as they are, so four hours pass from wherever the clock is. */
const TIPS = {
  advance: 'Pass one watch (4 hours). Minutes already spent in this watch stay.',
  short: 'Rest 1 hour. Refills short-rest pools, and hurt characters can spend hit dice.',
  long: 'Rest 8 hours. Restores HP, spell slots, and resources.',
};

/**
 * Mount the in-game clock: a "Day N, Watch" readout, the time spent inside
 * that watch, and controls to advance one watch and to take a short or long
 * rest. The panel owns no state. It reads the clock through `getClock`, and
 * every button calls back, so the caller advances time and applies rest
 * recovery to the party.
 *
 * `blockedReason` returns a reason while time must not pass, such as a
 * running fight. The buttons then carry `aria-disabled`, ignore clicks, and
 * show the reason as their tooltip. They stay focusable, so a keyboard user
 * can still read why.
 *
 * The panel builds its DOM once. `update` rewrites only the text and state
 * that changed, so a party step does not rebuild the buttons, and a button
 * does not lose focus after its own click.
 * @param {HTMLElement} container
 * @param {{
 *   getClock: () => GameClock,
 *   blockedReason?: () => string | null,
 *   onAdvance: () => void,
 *   onShortRest: () => void,
 *   onLongRest: () => void,
 * }} callbacks
 * @returns {{ update: () => void }}
 */
export function mountTimePanel(container, callbacks) {
  const label = el('span', 'time-panel__label');
  const progressText = el('span', 'time-panel__progress-text');
  const bar = /** @type {HTMLProgressElement} */ (el('progress', 'time-panel__bar'));
  bar.max = MINUTES_PER_WATCH;
  // The text beside the bar says the same thing in words, so the bar is
  // only for the eye.
  bar.setAttribute('aria-hidden', 'true');

  /** @type {{ button: HTMLButtonElement, tip: string }[]} */
  const buttons = [];
  /** @param {string} text @param {() => void} onClick @param {string} tip */
  const button = (text, onClick, tip) => {
    const built = textButton(
      text,
      () => {
        if (built.getAttribute('aria-disabled') === 'true') return;
        onClick();
        update();
      },
      { className: 'time-panel__btn' },
    );
    buttons.push({ button: built, tip });
    return built;
  };

  const root = el(
    'div',
    'time-panel',
    el('div', 'time-panel__readout u-row u-g2', icon('clock'), label),
    el('div', 'time-panel__progress', progressText, bar),
    el(
      'div',
      'time-panel__actions',
      button('Advance', callbacks.onAdvance, TIPS.advance),
      button('Short rest', callbacks.onShortRest, TIPS.short),
      button('Long rest', callbacks.onLongRest, TIPS.long),
    ),
  );
  container.appendChild(root);

  /** @type {string | undefined} */
  let lastClock;
  /** @type {string | null | undefined} */
  let lastBlock;

  function update() {
    const clock = callbacks.getClock();
    const text = `${formatClock(clock)}|${formatWatchProgress(clock)}`;
    if (text !== lastClock) {
      lastClock = text;
      label.textContent = formatClock(clock);
      progressText.textContent = formatWatchProgress(clock);
      bar.value = clock.minutes ?? 0;
    }
    const block = callbacks.blockedReason?.() ?? null;
    if (block !== lastBlock) {
      lastBlock = block;
      for (const { button: b, tip } of buttons) {
        b.setAttribute('aria-disabled', String(block !== null));
        setTip(b, block ?? tip);
      }
    }
  }

  update();
  return { update };
}
