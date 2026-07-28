import { DIE_TYPES, roll, emptySelection, formatResult } from '../dice/DiceRoller.js';
import { wireDisclosure } from './Disclosure.js';
import { icon } from './icons.js';
import { iconButton, segSwitch, textButton } from './buttons.js';
import { capitalize } from '../util/text.js';

/** @type {import('../types/dice.js').RollMode[]} */
const MODES = ['normal', 'advantage', 'disadvantage'];

/**
 * Mount a dice tray widget, collapsed by default to a D20 icon behind an
 * accessible disclosure button; expanding reveals the full tray (+/- counters
 * per die type, +/- modifier, roll button, result display). Only the latest
 * result shows in the tray; past rolls are the caller's to keep — `onRoll`
 * fires with each formatted result (the app records them in the travelogue).
 * `rollSelection` rolls programmatically (e.g. a weapon attack from the
 * initiative panel): it loads the given counts/modifier/target into the tray,
 * expands it so the result is visible, and rolls — without firing `onRoll`,
 * since such callers log under their own name.
 * @param {HTMLElement} container
 * @param {{ onRoll?: (text: string) => void }} [opts]
 * @returns {{
 *   getSelection: () => import('../types/dice.js').DiceSelection,
 *   rollSelection: (next: import('../types/dice.js').DiceSelection, target?: number | null) => { result: import('../types/dice.js').DiceResult, text: string },
 * }}
 */
export function mountDiceTray(container, opts = {}) {
  const selection = emptySelection();
  /** @type {(() => void)[]} re-syncs each stepper's count readout to the selection */
  const refreshers = [];

  const summary = document.createElement('button');
  summary.type = 'button';
  summary.className = 'disclosure dice-tray__summary';
  summary.setAttribute('aria-label', 'Dice tray');
  summary.append(
    icon('d20', { size: 28, className: 'dice-tray__d20' }),
    icon('chevron', { className: 'disclosure__chevron' }),
  );
  container.appendChild(summary);

  const root = document.createElement('div');
  root.className = 'dice-tray';
  const disclosure = wireDisclosure(summary, root);

  /** @param {string} label @param {number} delta @param {() => number} read @param {(n: number) => void} apply */
  const stepper = (label, delta, read, apply) => {
    const row = document.createElement('div');
    row.className = 'dice-tray__row';

    const name = document.createElement('span');
    name.className = 'dice-tray__label';
    name.textContent = label;

    const minus = iconButton('minus', `Decrease ${label}`, () => {
      apply(read() - delta);
      count.textContent = String(read());
    });

    const count = document.createElement('span');
    count.className = 'dice-tray__count';
    count.textContent = String(read());

    const plus = iconButton('plus', `Increase ${label}`, () => {
      apply(read() + delta);
      count.textContent = String(read());
    });

    row.append(name, minus, count, plus);
    refreshers.push(() => {
      count.textContent = String(read());
    });
    return row;
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

  // Advantage/disadvantage segmented toggle: rolls every d20 twice, keeping
  // the higher (advantage) or lower (disadvantage) die. The choice is sticky
  // until changed, so a GM can set it once and attack through it.
  const modeRow = document.createElement('div');
  modeRow.className = 'dice-tray__row';
  const modeName = document.createElement('span');
  modeName.className = 'dice-tray__label';
  modeName.textContent = 'd20 mode';
  const modeSwitch = segSwitch({
    ariaLabel: 'Roll d20s normally, with advantage, or with disadvantage',
    options: MODES.map((mode) => ({ value: mode, label: capitalize(mode) })),
    value: selection.mode ?? 'normal',
    onChange: (mode) => {
      selection.mode = mode;
    },
  });
  // The selection is the value of record here, and a programmatic roll writes
  // straight to it, so the buttons re-read it rather than holding it.
  refreshers.push(() => modeSwitch.sync(selection.mode ?? 'normal'));
  modeRow.append(modeName, modeSwitch.element);
  root.appendChild(modeRow);

  // Optional difficulty target: when set, each roll also reports success or
  // failure against it (meets-it-beats-it), in the tray and travelogue alike.
  const targetRow = document.createElement('div');
  targetRow.className = 'dice-tray__row';
  const targetName = document.createElement('span');
  targetName.className = 'dice-tray__label';
  targetName.textContent = 'target';
  const targetInput = document.createElement('input');
  targetInput.type = 'number';
  targetInput.className = 'field dice-tray__target';
  targetInput.placeholder = 'none';
  targetInput.setAttribute('aria-label', 'Target number to beat (optional)');
  targetRow.append(targetName, targetInput);
  root.appendChild(targetRow);

  const rollButton = textButton('Roll', () => opts.onRoll?.(performRoll().text), {
    icon: 'dice',
    variant: 'primary',
    className: 'dice-tray__roll',
  });

  const resultEl = document.createElement('div');
  resultEl.className = 'dice-tray__result';

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
      // Callers that don't name a mode inherit the tray's toggle, so weapon
      // attacks respect a standing advantage/disadvantage choice.
      selection.mode = next.mode ?? selection.mode ?? 'normal';
      targetInput.value = target === null ? '' : String(target);
      for (const refresh of refreshers) refresh();
      disclosure.setExpanded(true);
      return performRoll();
    },
  };
}
