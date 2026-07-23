import { DIE_TYPES, roll, emptySelection } from '../dice/DiceRoller.js';
import { wireDisclosure } from './Disclosure.js';
import { icon } from './icons.js';

/**
 * Mount a dice tray widget, collapsed by default to a D20 icon behind an
 * accessible disclosure button; expanding reveals the full tray (+/- counters
 * per die type, +/- modifier, roll button, result display).
 * @param {HTMLElement} container
 * @returns {{ getSelection: () => import('../types/dice.js').DiceSelection }}
 */
export function mountDiceTray(container) {
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

  const rollButton = document.createElement('button');
  rollButton.type = 'button';
  rollButton.className = 'btn btn--primary dice-tray__roll';
  rollButton.append(icon('dice'), document.createTextNode('Roll'));

  const resultEl = document.createElement('div');
  resultEl.className = 'dice-tray__result';

  // Session-local roll history: the latest handful of results, newest first,
  // so contested rolls can be compared after the fact. Not persisted.
  const historyEl = document.createElement('ol');
  historyEl.className = 'dice-tray__history';
  historyEl.setAttribute('aria-label', 'Recent rolls');
  const HISTORY_MAX = 8;

  rollButton.addEventListener('click', () => {
    const result = roll(selection);
    const text = formatResult(result);
    resultEl.textContent = text;

    const entry = document.createElement('li');
    entry.className = 'dice-tray__history-entry';
    const at = document.createElement('span');
    at.className = 'dice-tray__history-time';
    at.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    entry.append(at, document.createTextNode(` ${text}`));
    historyEl.prepend(entry);
    while (historyEl.children.length > HISTORY_MAX) {
      /** @type {Element} */ (historyEl.lastElementChild).remove();
    }
  });

  root.append(rollButton, resultEl, historyEl);
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
