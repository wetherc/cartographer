import { setTip } from './Tooltip.js';
import { labeled, fieldRow, checkbox, numberField, select } from './formFields.js';
import { el } from './dom.js';
import { RIDER_ROLLS, DEFAULT_RIDER_DIE } from '../entities/Riders.js';

/** @typedef {import('../types/spell.js').Spell} Spell */

/** The dice a rider can use. Every rider in the SRD is a d4, and the rest are
 * here so a homebrew spell is not stuck with one. The normalizer accepts any
 * die, and this is only what the picker offers. */
const RIDER_DICE = ['d4', 'd6', 'd8', 'd10', 'd12'];

/**
 * The spell form's rider controls: what the chip that a save or a buff
 * imposes adds to its holder's later rolls (Bless, Bane, Guidance).
 * `ui/SpellForm.js` places the rows, calls `sync` when the effect kind or
 * the condition changes, and reads the values back with `read`.
 * `entities/SpellDraft.js` decides what they mean.
 * @param {Spell | null} spell the spell being edited, or null for a new one
 */
export function buildRiderControls(spell) {
  const effect = spell?.effect;
  const stored = effect?.kind === 'save' || effect?.kind === 'buff' ? (effect.rider ?? null) : null;
  const diceInput = numberField(stored?.dice ?? 0, { className: 'form__number' });
  setTip(diceInput, 'Negative for a penalty die, as with Bane');
  const dieSelect = select([...RIDER_DICE], stored?.die ?? DEFAULT_RIDER_DIE);
  const flatInput = numberField(stored?.flat ?? 0, { className: 'form__number' });
  const rollChecks = RIDER_ROLLS.map((roll) =>
    checkbox(roll, stored?.rolls.includes(roll) ?? false),
  );
  const once = checkbox('One roll only', stored?.once === true);
  setTip(once.label, 'The first roll the rider changes uses up the chip, as with Guidance');

  const rows = {
    dice: fieldRow(
      labeled('Rider dice', diceInput),
      labeled('Die', dieSelect),
      labeled('Flat', flatInput),
    ),
    rolls: fieldRow(
      labeled('Applies to', el('div', 'u-row u-wrap u-g2', ...rollChecks.map((c) => c.label))),
    ),
    once: fieldRow(once.label),
  };

  /**
   * Show the rows when the spell has a chip for the rider to ride on. A save
   * has one only once it names a condition, and a buff always has one.
   * @param {string} kind
   * @param {boolean} hasCondition
   */
  function sync(kind, hasCondition) {
    const rides = kind === 'buff' || (kind === 'save' && hasCondition);
    rows.dice.hidden = !rides;
    rows.rolls.hidden = !rides;
    rows.once.hidden = !rides;
  }

  /** The control values, for `SpellDraft.assembleSpell`. */
  function read() {
    return {
      rolls: RIDER_ROLLS.filter((_, i) => rollChecks[i].input.checked),
      dice: diceInput.value,
      die: dieSelect.value,
      flat: flatInput.value,
      once: once.input.checked,
    };
  }

  return { rows, sync, read };
}
