import { DIE_TYPES, roll, emptySelection, formatResult } from '../dice/DiceRoller.js';
import { wireDisclosure } from './Disclosure.js';
import { icon } from './icons.js';
import { iconButton, segSwitch, textButton } from './buttons.js';
import { el } from './dom.js';
import { numberField } from './formFields.js';
import { capitalize } from '../util/text.js';

/** @type {import('../types/dice.js').RollMode[]} */
const MODES = ['normal', 'advantage', 'disadvantage'];

/**
 * Mount a dice tray widget. By default it collapses to a D20 icon behind an
 * accessible disclosure button. Expanding it reveals the full tray: a
 * plus/minus counter for each die type, a plus/minus modifier, a roll
 * button, and a result display. The tray shows only the latest result. The
 * caller keeps past rolls: `onRoll` fires with each formatted result, and
 * the app records it in the travelogue.
 *
 * `rollSelection` rolls the tray programmatically, for example for a weapon
 * attack from the initiative panel. It loads the given counts, modifier, and
 * target into the tray, expands the tray so the result is visible, and
 * rolls. It does not fire `onRoll`, because such callers log the roll under
 * their own name.
 * @param {HTMLElement} container
 * @param {{ onRoll?: (text: string) => void }} [opts]
 * @returns {{
 *   getSelection: () => import('../types/dice.js').DiceSelection,
 *   rollSelection: (next: import('../types/dice.js').DiceSelection, target?: number | null) => { result: import('../types/dice.js').DiceResult, text: string },
 * }}
 */
export function mountDiceTray(container, opts = {}) {
  const selection = emptySelection();
  /** @type {(() => void)[]} functions that re-sync each stepper's count readout to the selection */
  const refreshers = [];

  const summary = el(
    'button',
    'disclosure dice-tray__summary u-row u-g2',
    icon('d20', { size: 28, className: 'dice-tray__d20' }),
    icon('chevron', { className: 'disclosure__chevron' }),
  );
  summary.type = 'button';
  summary.setAttribute('aria-label', 'Dice tray');
  container.appendChild(summary);

  const root = el('div', 'dice-tray');
  const disclosure = wireDisclosure(summary, root);

  /** @param {string} label @param {number} delta @param {() => number} read @param {(n: number) => void} apply */
  const stepper = (label, delta, read, apply) => {
    const name = el('span', 'dice-tray__label u-muted', label);

    const minus = iconButton('minus', `Decrease ${label}`, () => {
      apply(read() - delta);
      count.textContent = String(read());
    });

    const count = el('span', 'dice-tray__count', String(read()));

    const plus = iconButton('plus', `Increase ${label}`, () => {
      apply(read() + delta);
      count.textContent = String(read());
    });

    refreshers.push(() => {
      count.textContent = String(read());
    });
    return el('div', 'dice-tray__row u-row u-g2', name, minus, count, plus);
  };

  for (const die of DIE_TYPES) {
    root.appendChild(
      stepper(
        die,
        1,
        () => selection.counts[die] ?? 0,
        (next) => {
          selection.counts[die] = Math.max(0, next);
        },
      ),
    );
  }

  root.appendChild(
    stepper(
      'modifier',
      1,
      () => selection.modifier,
      (next) => {
        selection.modifier = next;
      },
    ),
  );

  // The advantage/disadvantage toggle rolls every d20 twice. It keeps the
  // higher die for advantage and the lower die for disadvantage. The choice
  // stays sticky until changed, so a GM can set it once and attack through it.
  const modeName = el('span', 'dice-tray__label u-muted', 'd20 mode');
  const modeSwitch = segSwitch({
    ariaLabel: 'Roll d20s normally, with advantage, or with disadvantage',
    options: MODES.map((mode) => ({ value: mode, label: capitalize(mode) })),
    value: selection.mode ?? 'normal',
    onChange: (mode) => {
      selection.mode = mode;
    },
  });
  // The selection is the value of record here. A programmatic roll writes
  // straight to it, so the buttons re-read the selection rather than holding
  // their own copy.
  refreshers.push(() => modeSwitch.sync(selection.mode ?? 'normal'));
  root.appendChild(el('div', 'dice-tray__row u-row u-g2', modeName, modeSwitch.element));

  // The difficulty target is optional. When set, each roll also reports
  // success or failure against it, using a meets-it-or-beats-it rule, in the
  // tray and the travelogue.
  const targetInput = numberField('', {
    placeholder: 'none',
    className: 'dice-tray__target',
    ariaLabel: 'Target number to beat (optional)',
  });
  root.appendChild(
    el(
      'div',
      'dice-tray__row u-row u-g2',
      el('span', 'dice-tray__label u-muted', 'target'),
      targetInput,
    ),
  );

  const rollButton = textButton('Roll', () => opts.onRoll?.(performRoll().text), {
    icon: 'dice',
    variant: 'primary',
    className: 'dice-tray__roll',
  });

  const resultEl = el('div', 'dice-tray__result');

  function performRoll() {
    const result = roll(selection);
    let text = formatResult(result);
    const target = targetInput.value === '' ? null : Number(targetInput.value);
    if (target !== null && Number.isFinite(target)) {
      text += ` vs target ${target}: ${result.total >= target ? 'success' : 'failure'}`;
    }
    resultEl.textContent = text;
    return { result, text };
  }

  root.append(rollButton, resultEl);
  container.appendChild(root);

  return {
    getSelection: () => selection,
    rollSelection: (next, target = null) => {
      for (const die of DIE_TYPES) selection.counts[die] = next.counts[die] ?? 0;
      selection.modifier = next.modifier ?? 0;
      // A caller that does not name a mode inherits the tray's toggle, so
      // weapon attacks respect a standing advantage/disadvantage choice.
      selection.mode = next.mode ?? selection.mode ?? 'normal';
      targetInput.value = target === null ? '' : String(target);
      for (const refresh of refreshers) refresh();
      disclosure.setExpanded(true);
      return performRoll();
    },
  };
}
