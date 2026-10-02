import { setTip } from './Tooltip.js';
import { labeled, fieldRow, checkbox, numberField, select } from './formFields.js';
import { DIE_SIZES } from '../entities/Equipment.js';

/** @typedef {import('../types/spell.js').Spell} Spell */

/**
 * The spell form's controls for a save spell that reads the hit points of
 * its targets: an HP limit (Power Word Stun), an HP pool that the cast rolls
 * in place of a save (Sleep), a failed save that kills (Power Word Kill), and
 * a condition that damage ends. `ui/SpellForm.js` places the rows, calls
 * `sync` when the effect kind or the condition changes, and reads the values
 * back with `read`. `entities/SpellDraft.js` decides what they mean.
 * @param {Spell | null} spell the spell being edited, or null for a new one
 */
export function buildHPControls(spell) {
  const save = spell?.effect.kind === 'save' ? spell.effect : null;
  const pool = save?.hpPool ?? null;

  // Power Word Stun skips the first save for a target at or under its HP
  // limit and leaves one above it alone. 0 means every target rolls.
  const hpLimit = numberField(save?.hpLimit ?? 0, { min: 0, className: 'form__number' });
  setTip(
    hpLimit,
    'A target at or under this HP fails the first save. One above it is unaffected. 0 for none',
  );

  const pools = checkbox('Rolls an HP pool', !!pool);
  setTip(pools.label, 'Sleep rolls 5d8 and affects the lowest-HP targets that fit. No save');
  const count = numberField(pool?.count ?? 5, { min: 1, max: 40, className: 'form__number' });
  const sides = select(
    DIE_SIZES.map((n) => ({ value: String(n), label: `d${n}` })),
    String(pool?.sides ?? 8),
  );
  const perStep = numberField(pool?.perStep ?? 0, { min: 0, max: 40, className: 'form__number' });
  setTip(perStep, 'More dice for each slot level above the spell');

  const kills = checkbox('A failed save kills', save?.kills === true);
  setTip(kills.label, 'Power Word Kill kills a creature at or under its HP limit');
  const endsOnDamage = checkbox('Damage ends the condition', save?.endsOnDamage === true);
  setTip(endsOnDamage.label, 'Sleep ends on a creature that takes damage');

  const rows = {
    limit: fieldRow(labeled('HP limit', hpLimit)),
    kills: fieldRow(kills.label),
    pools: fieldRow(pools.label),
    pool: fieldRow(
      labeled('Pool dice', count),
      labeled('Die', sides),
      labeled('Dice per level', perStep),
    ),
    endsOnDamage: fieldRow(endsOnDamage.label),
  };

  /**
   * Show the rows a save uses. The pool dice show once their box is ticked,
   * and the end on damage once the save names a condition.
   * @param {string} kind
   * @param {boolean} hasCondition
   */
  function sync(kind, hasCondition) {
    const saves = kind === 'save';
    rows.limit.hidden = !saves;
    rows.kills.hidden = !saves;
    rows.pools.hidden = !saves;
    rows.pool.hidden = !saves || !pools.input.checked;
    rows.endsOnDamage.hidden = !saves || !hasCondition;
  }

  /** @param {() => void} onChange */
  function listen(onChange) {
    pools.input.addEventListener('change', onChange);
  }

  /** The control values, for `SpellDraft.assembleSpell`. */
  function read() {
    return {
      hpLimit: hpLimit.value,
      hpPool: pools.input.checked
        ? { count: count.value, sides: sides.value, perStep: perStep.value }
        : null,
      kills: kills.input.checked,
      endsOnDamage: endsOnDamage.input.checked,
    };
  }

  return { rows, sync, listen, read };
}
