import { DIE_TYPES, roll, emptySelection } from '../dice/DiceRoller.js';
import { icon } from './icons.js';

/**
 * Mount a dice tray widget: +/- counters per die type, +/- modifier, roll button, result display.
 * @param {HTMLElement} container
 * @returns {{ getSelection: () => import('../types/dice.js').DiceSelection }}
 */
export function mountDiceTray(container) {
  const selection = emptySelection();

  const root = document.createElement('div');
  root.className = 'dice-tray';

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

  const rollButton = document.createElement('button');
  rollButton.type = 'button';
  rollButton.className = 'btn btn--primary dice-tray__roll';
  rollButton.append(icon('dice'), document.createTextNode('Roll'));

  const resultEl = document.createElement('div');
  resultEl.className = 'dice-tray__result';

  rollButton.addEventListener('click', () => {
    const result = roll(selection);
    resultEl.textContent = formatResult(result);
  });

  root.append(rollButton, resultEl);
  container.appendChild(root);

  return { getSelection: () => selection };
}

/**
 * @param {import('../types/dice.js').DiceResult} result
 * @returns {string}
 */
function formatResult(result) {
  const parts = result.results.map((r) => `${r.die}[${r.rolls.join(',')}]=${r.subtotal}`);
  if (result.modifier !== 0) parts.push(`modifier=${result.modifier}`);
  return `${parts.join(' + ')} -> total: ${result.total}`;
}
