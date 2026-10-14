import { setTip } from './Tooltip.js';
import { labeled, fieldRow, checkbox, numberField } from './formFields.js';
import { buildDamageEditor } from './ItemFormEditors.js';
import { HEALING_TYPE } from '../entities/DamageParts.js';

/** @typedef {import('../types/spell.js').Spell} Spell */

/**
 * The spell form's controls for scaling with the slot level: the toggle, the
 * extra dice for each step, the extra targets for each step, and the slot
 * levels in one step. `ui/SpellForm.js` places the rows, calls
 * `setFixedType` when the effect kind changes and `setCantrip` when the
 * level changes, and reads the values back with `read`. A cantrip scales
 * at caster levels 5, 11, and 17 (`CastScaling.cantripStep`) and ignores
 * the levels per step, so for a cantrip the captions name those levels and
 * the levels-per-step field hides. `entities/SpellDraft.js` cleans the values.
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
  const diceField = labeled('', dice.element);
  const targetsField = labeled('', targetsInput);
  const stepField = labeled('Levels per step', levelsPerStepInput);
  const rows = {
    toggle: fieldRow(scales.label),
    damage: fieldRow(diceField),
    targets: fieldRow(targetsField, stepField),
  };

  /** @param {boolean} cantrip whether the spell is a cantrip (level 0) */
  function setCantrip(cantrip) {
    const per = cantrip ? 'at levels 5, 11, 17' : '/ level';
    caption(diceField).textContent = `Extra dice ${per}`;
    caption(targetsField).textContent = `Extra targets ${per}`;
    stepField.hidden = cantrip;
  }
  // A new spell starts at level 0, the first choice of the level select.
  setCantrip((spell?.level ?? 0) === 0);

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

  return { rows, setFixedType: dice.setFixedType, setCantrip, read };
}

/**
 * The caption span of a `labeled` field.
 * @param {HTMLElement} field
 */
function caption(field) {
  return /** @type {HTMLElement} */ (field.firstElementChild);
}
