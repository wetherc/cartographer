import { DIE_TYPES, roll, emptySelection, formatResult } from '../dice/DiceRoller.js';
import { wireDisclosure } from './Disclosure.js';
import { icon } from './icons.js';

/**
 * Mount a dice tray widget, collapsed by default to a D20 icon behind an
 * accessible disclosure button; expanding reveals the full tray (+/- counters
 * per die type, +/- modifier, roll button, result display). Only the latest
 * result shows in the tray; past rolls are the caller's to keep — `onRoll`
 * fires with each formatted result (the app records them in the travelogue).
 * @param {HTMLElement} container
 * @param {{ onRoll?: (text: string) => void }} [opts]
 * @returns {{ getSelection: () => import('../types/dice.js').DiceSelection }}
 */
export function mountDiceTray(container, opts = {}) {
  const selection = emptySelection();

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
  wireDisclosure(summary, root);

  /** @param {string} label @param {number} delta @param {() => number} read @param {(n: number) => void} apply */
  const stepper = (label, delta, read, apply) => {
    const row = document.createElement('div');
    row.className = 'dice-tray__row';

    const name = document.createElement('span');
    name.className = 'dice-tray__label';
    name.textContent = label;

    const minus = document.createElement('button');
    minus.type = 'button';
    minus.className = 'btn btn--icon';
    minus.setAttribute('aria-label', `Decrease ${label}`);
    minus.appendChild(icon('minus'));
    minus.addEventListener('click', () => {
      apply(read() - delta);
      count.textContent = String(read());
    });

    const count = document.createElement('span');
    count.className = 'dice-tray__count';
    count.textContent = String(read());

    const plus = document.createElement('button');
    plus.type = 'button';
    plus.className = 'btn btn--icon';
    plus.setAttribute('aria-label', `Increase ${label}`);
    plus.appendChild(icon('plus'));
    plus.addEventListener('click', () => {
      apply(read() + delta);
      count.textContent = String(read());
    });

    row.append(name, minus, count, plus);
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

  const rollButton = document.createElement('button');
  rollButton.type = 'button';
  rollButton.className = 'btn btn--primary dice-tray__roll';
  rollButton.append(icon('dice'), document.createTextNode('Roll'));

  const resultEl = document.createElement('div');
  resultEl.className = 'dice-tray__result';

  rollButton.addEventListener('click', () => {
    const result = roll(selection);
    let text = formatResult(result);
    const target = targetInput.value === '' ? null : Number(targetInput.value);
    if (target !== null && Number.isFinite(target)) {
      text += ` vs target ${target}: ${result.total >= target ? 'success' : 'failure'}`;
    }
    resultEl.textContent = text;
    opts.onRoll?.(text);
  });

  root.append(rollButton, resultEl);
  container.appendChild(root);

  return { getSelection: () => selection };
}
