import { DIE_TYPES, roll, emptySelection, formatResult } from '../dice/DiceRoller.js';
import { buildDisclosure } from './Disclosure.js';
import { icon } from './icons.js';
import { iconButton, segSwitch, textButton } from './buttons.js';
import { el } from './dom.js';
import { checkbox, numberField, select, setOptions } from './formFields.js';
import { capitalize } from '../util/text.js';
import { parseTarget, rollTarget } from '../dice/TrayTarget.js';
import { resultSummary } from '../dice/ResultLine.js';

/** @type {import('../types/dice.js').RollMode[]} */
const MODES = ['normal', 'advantage', 'disadvantage'];

/**
 * Mount a dice tray widget. By default it collapses to a D20 icon behind an
 * accessible disclosure button. Expanding it reveals the full tray: a
 * plus/minus counter for each die type, a plus/minus modifier, a roll
 * button, and a result display. The result display appears with the first
 * roll and shows only the latest result. The
 * caller keeps past rolls: `onRoll` fires with each formatted result, and
 * the app records it in the travelogue.
 *
 * `rollSelection` rolls the tray programmatically, for example for a weapon
 * attack from the initiative panel. It rolls the given counts and modifier
 * against the given target and shows the result. The dice, the modifier, and
 * the target field keep what the GM set, so the GM's next Roll does not
 * repeat the attack. It does not fire `onRoll`, because such callers log the
 * roll under their own name. Without `keep`, it expands the tray so the
 * result is visible. With `keep`, the tray stays closed and the roll uses
 * the target that the GM typed. A save or a check from the character sheet
 * rolls this way, so the GM can type a DC once and roll several checks
 * against it.
 *
 * The **Hidden roll** box marks the tray's own rolls as secret, and `onRoll`
 * passes its state on. The box stays ticked until the GM clears it. The
 * stylesheet hides it in a Player tab, which has nothing to roll in secret.
 *
 * With `tables`, a row under the footer picks a random table and rolls on
 * it. `tables.list` gives the picker its choices each time it takes focus,
 * so a table added in Library mode shows without a remount. `tables.onRoll`
 * rolls the chosen table, logs the line, and returns the text that the
 * result line shows. The Hidden roll box applies to a table roll too. The
 * stylesheet hides the row in a Player tab.
 * @param {HTMLElement} container
 * @param {{
 *   onRoll?: (text: string, flags: { hidden: boolean }) => void,
 *   tables?: {
 *     list: () => { value: string, label: string }[],
 *     onRoll: (key: string, flags: { hidden: boolean }) => string | null,
 *   },
 * }} [opts]
 * @returns {{
 *   getSelection: () => import('../types/dice.js').DiceSelection,
 *   rollSelection: (next: import('../types/dice.js').DiceSelection, target?: number | null, options?: import('../types/dice.js').TrayRollOptions) => import('../types/dice.js').TrayRoll,
 *   clearResult: () => void,
 * }}
 */
export function mountDiceTray(container, opts = {}) {
  const selection = emptySelection();
  /** @type {(() => void)[]} functions that re-sync each stepper's count readout to the selection */
  const refreshers = [];

  const root = el('div', 'dice-tray');
  const disclosure = buildDisclosure({
    headChildren: [
      icon('d20', { size: 28, className: 'dice-tray__d20' }),
      el('span', 'dice-tray__title', 'Roll dice'),
    ],
    body: root,
    className: 'dice-tray__summary',
  });
  container.appendChild(disclosure.head);

  /**
   * One compact die cell: the die name, a minus button, the count, and a plus
   * button. The cells sit in a grid that fits the tray width.
   * @param {string} label the short name shown in the cell
   * @param {string} name the name that the button labels read
   * @param {() => number} read
   * @param {(n: number) => void} apply
   */
  const stepper = (label, name, read, apply) => {
    const count = el('span', 'dice-tray__count', String(read()));
    const cell = el('div', 'dice-tray__die');
    const sync = () => {
      count.textContent = String(read());
      cell.classList.toggle('dice-tray__die--set', read() !== 0);
    };
    const step = (/** @type {number} */ delta) => () => {
      apply(read() + delta);
      sync();
    };
    cell.append(
      el('span', 'dice-tray__label', label),
      iconButton('minus', `Decrease ${name}`, step(-1), { className: 'dice-tray__step' }),
      count,
      iconButton('plus', `Increase ${name}`, step(1), { className: 'dice-tray__step' }),
    );
    refreshers.push(sync);
    return cell;
  };

  // The result line sits on top, so the latest total is the first thing the
  // GM reads in the open tray. It stays out of the layout until there is a
  // result to show, because an empty sunken box reads as a broken readout.
  const resultEl = el('div', 'dice-tray__result');
  // A screen reader hears each new result without taking focus off the tray.
  resultEl.setAttribute('role', 'status');
  resultEl.hidden = true;
  const dice = el('div', 'dice-tray__dice');
  root.append(resultEl, dice);

  for (const die of DIE_TYPES) {
    dice.appendChild(
      stepper(
        die,
        die,
        () => selection.counts[die] ?? 0,
        (next) => {
          selection.counts[die] = Math.max(0, next);
        },
      ),
    );
  }

  dice.appendChild(
    stepper(
      'mod',
      'modifier',
      () => selection.modifier,
      (next) => {
        selection.modifier = next;
      },
    ),
  );

  // The advantage/disadvantage toggle rolls every d20 twice. It keeps the
  // higher die for advantage and the lower die for disadvantage. The choice
  // stays sticky until changed, so a GM can set it once and attack through it.
  // Only this switch writes the sticky choice. A programmatic roll that names
  // its own mode applies that mode to one roll and leaves the toggle alone.
  /** @type {import('../types/dice.js').RollMode} */
  let standingMode = 'normal';
  const modeSwitch = segSwitch({
    ariaLabel: 'Roll d20s normally, with advantage, or with disadvantage',
    options: MODES.map((mode) => ({ value: mode, label: capitalize(mode) })),
    value: selection.mode ?? 'normal',
    onChange: (mode) => {
      standingMode = mode;
      selection.mode = mode;
    },
  });
  // The selection is the value of record here. A programmatic roll writes
  // straight to it, so the buttons re-read the selection rather than holding
  // their own copy.
  refreshers.push(() => modeSwitch.sync(selection.mode ?? 'normal'));
  // The switch fills its own line and divides it between the three words,
  // which keeps "Disadvantage" whole in the narrow combat column. Its
  // aria-label names what it controls, so it needs no visible label.
  root.appendChild(el('div', 'dice-tray__mode-row', modeSwitch.element));

  // The difficulty target is optional. When set, each roll also reports
  // success or failure against it, using a meets-it-or-beats-it rule, in the
  // tray and the travelogue.
  const targetInput = numberField('', {
    placeholder: 'none',
    className: 'dice-tray__target',
    ariaLabel: 'Target number or DC to meet (optional)',
  });

  const hiddenBox = checkbox('Hidden roll', false, { className: 'dice-tray__hidden' });
  hiddenBox.label.title = 'Players see only that the GM rolled';

  const rollButton = textButton(
    'Roll',
    () =>
      opts.onRoll?.(performRoll(parseTarget(targetInput.value)).text, {
        hidden: hiddenBox.input.checked,
      }),
    {
      icon: 'dice',
      variant: 'primary',
      className: 'dice-tray__roll',
    },
  );

  /**
   * Roll the loaded selection and show the result against `target`. An
   * attack roll reads "hit" or "miss" (see `resultSummary`).
   * @param {number | null} target
   * @param {{ critOn?: number } | null} [attack]
   */
  function performRoll(target, attack = null) {
    const result = roll(selection);
    const summary = resultSummary(result, target, attack);
    let text = formatResult(result);
    if (target !== null) {
      const word = attack
        ? summary.passed
          ? 'hit'
          : 'miss'
        : summary.passed
          ? 'success'
          : 'failure';
      text += ` vs target ${target}: ${word}`;
    }
    const verdict =
      summary.verdict === null
        ? null
        : el(
            'span',
            `dice-tray__verdict${summary.passed ? '' : ' dice-tray__verdict--fail'}`,
            summary.verdict,
          );
    resultEl.replaceChildren(
      el('span', 'dice-tray__total', String(summary.total)),
      el('span', 'dice-tray__detail u-muted', summary.detail),
      verdict ?? '',
    );
    resultEl.hidden = false;
    // On a short screen the Play dock caps the tray's height, and the tray
    // scrolls inside its card. The result line is at the top, so the tray
    // scrolls back to it, or a Roll press at the bottom would show
    // no total.
    root.scrollTop = 0;
    return { result, text };
  }

  // The target field and the Roll button share the last line.
  const targetField = el(
    'label',
    'dice-tray__target-field',
    el('span', 'dice-tray__target-label', 'DC'),
    targetInput,
  );
  root.appendChild(el('div', 'dice-tray__footer', targetField, hiddenBox.label, rollButton));
  if (opts.tables) root.appendChild(tableRow(opts.tables));
  container.appendChild(root);

  /**
   * The table roll row: a picker over the library tables and a Roll table
   * button. The result line shows the table name and the row text.
   * @param {NonNullable<typeof opts.tables>} tables
   */
  function tableRow(tables) {
    const picker = select([], '', { ariaLabel: 'Random table' });
    const refill = () => setOptions(picker, tables.list(), picker.value);
    picker.addEventListener('focus', refill);
    picker.addEventListener('pointerdown', refill);
    refill();
    const button = textButton(
      'Roll table',
      () => {
        refill();
        const text = picker.value
          ? tables.onRoll(picker.value, { hidden: hiddenBox.input.checked })
          : null;
        if (text === null) return;
        const name = picker.selectedOptions[0]?.textContent ?? '';
        resultEl.replaceChildren(
          el('span', 'dice-tray__table-name u-muted', name),
          el('span', 'dice-tray__table-text', text),
        );
        resultEl.hidden = false;
        root.scrollTop = 0;
      },
      { icon: 'scroll' },
    );
    return el('div', 'dice-tray__tables', picker, button);
  }

  return {
    getSelection: () => selection,
    // A roll made outside the tray, such as a spell cast, clears the result
    // line, so the tray does not show an earlier roll as if it were the new
    // one.
    clearResult: () => {
      resultEl.replaceChildren();
      resultEl.hidden = true;
    },
    rollSelection: (next, target = null, { keep = false, attack = null } = {}) => {
      // The roll borrows the tray. The dice and the modifier the GM set up
      // come back after the roll, so the GM's next Roll is the GM's own dice.
      // With `keep`, the target field is the target of this roll and the tray
      // stays closed. Without `keep`, the roll uses the target it passed.
      const saved = { counts: { ...selection.counts }, modifier: selection.modifier };
      for (const die of DIE_TYPES) selection.counts[die] = next.counts[die] ?? 0;
      selection.modifier = next.modifier ?? 0;
      // A caller that does not name a mode inherits the tray's toggle, so
      // weapon attacks respect a standing advantage/disadvantage choice. A
      // caller that names one uses it for this roll only: the toggle goes
      // back to the GM's own choice afterward.
      selection.mode = next.mode ?? standingMode;
      if (!keep) disclosure.setExpanded(true);
      // The restore runs even when the roll throws, so a failed programmatic
      // roll cannot leave the toggle showing a mode the GM never picked.
      try {
        const used = rollTarget(target, targetInput.value, keep);
        return { ...performRoll(used, attack), target: used };
      } finally {
        selection.mode = standingMode;
        for (const die of DIE_TYPES) selection.counts[die] = saved.counts[die] ?? 0;
        selection.modifier = saved.modifier;
        for (const refresh of refreshers) refresh();
      }
    },
  };
}
