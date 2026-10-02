import { setTip } from './Tooltip.js';
import { labeled, fieldRow, checkbox, numberField } from './formFields.js';
import { buildDamageEditor } from './ItemFormEditors.js';
import { HEALING_TYPE } from '../entities/Equipment.js';

/** @typedef {import('../types/spell.js').Spell} Spell */

/**
 * The spell form's controls for scaling with the slot level: the toggle, the
 * extra dice for each step, the extra targets for each step, and the slot
 * levels in one step. `ui/SpellForm.js` places the rows, calls
 * `setFixedType` when the effect kind changes, and reads the values back with
 * `read`. `entities/SpellDraft.js` cleans the values.
 * @param {Spell | null} spell the spell being edited, or null for a new one
 */
export function buildScalingControls(spell) {
  const scales = checkbox('Scales per level', !!spell?.scaling);
  // A spell that scales only its targets (Hold Person) starts with no extra
  // dice. The sample term is only for a spell with no scaling block yet, so
  // a save of an unchanged form cannot add damage the spell never dealt.
  const dice = buildDamageEditor(
    spell?.scaling
      ? (spell.scaling.damagePerLevel ?? [])
      : [{ count: 1, sides: 6, damageType: 'fire' }],
    spell?.effect.kind === 'heal' ? HEALING_TYPE : null,
  );
  const targetsInput = numberField(spell?.scaling?.targetsPerLevel ?? 0, {
    min: 0,
    className: 'form__number',
  });
  const levelsPerStepInput = numberField(spell?.scaling?.levelsPerStep ?? 1, {
    min: 1,
    max: 9,
    className: 'form__number',
  });
  setTip(
    levelsPerStepInput,
    'Slot levels per step of scaling. 2 for a spell that grows every two levels',
  );
  // Keep the multi-line dice editor and the lone targets number on separate
  // rows. A shared flex row leaves the small number field floating beside the
  // taller editor.
  const rows = {
    toggle: fieldRow(scales.label),
    damage: fieldRow(labeled('Extra dice / level', dice.element)),
    targets: fieldRow(
      labeled('Extra targets / level', targetsInput),
      labeled('Levels per step', levelsPerStepInput),
    ),
  };

  function sync() {
    const hide = !scales.input.checked;
    rows.damage.hidden = hide;
    rows.targets.hidden = hide;
  }
  scales.input.addEventListener('change', sync);
  sync();

  /** The scaling block for `SpellDraft.assembleSpell`, or null when off. */
  function read() {
    return scales.input.checked
      ? {
          damagePerLevel: dice.get(),
          targetsPerLevel: targetsInput.value,
          levelsPerStep: levelsPerStepInput.value,
        }
      : null;
  }

  return { rows, setFixedType: dice.setFixedType, read };
}
