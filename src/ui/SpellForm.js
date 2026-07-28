import { CLASS_LIST } from '../entities/Classes.js';
import { SPELL_SCHOOLS, SPELL_ABILITIES, SPELL_EFFECT_KINDS } from '../data/spells.js';
import { buildDamageEditor } from './ItemFormEditors.js';
import { labeled, fieldRow, checkbox, textField, select, formActions } from './formFields.js';
import { clampInt } from '../util/num.js';

/** @typedef {import('../types/spell.js').Spell} Spell */
/** @typedef {import('../types/spell.js').SpellEffect} SpellEffect */

/** The component letters a spell may require, with their 5e meanings. */
const COMPONENTS = [
  { letter: 'V', title: 'Verbal' },
  { letter: 'S', title: 'Somatic' },
  { letter: 'M', title: 'Material' },
];

/**
 * The spell create/edit form, inline in the Library rail like the item form.
 * Every field of a Spell is here: descriptive metadata, a class multi-select,
 * component letters, and an effect section that swaps its inner controls with
 * the chosen effect kind (attack damage, save ability/damage/condition, heal
 * dice, or nothing for utility). Submitting calls `onSubmit` with the assembled
 * spell minus its id — the caller owns identity and the merge key. Editing a
 * built-in default stores the result as a custom override.
 * @param {{
 *   spell?: Spell | null,
 *   submitLabel: string,
 *   onSubmit: (spell: Omit<Spell, 'id'>) => void,
 *   onCancel?: (() => void) | null,
 * }} options
 * @returns {HTMLElement}
 */
export function buildSpellForm({ spell = null, submitLabel, onSubmit, onCancel = null }) {
  const form = document.createElement('div');
  form.className = 'inventory-panel__form spell-form';

  const nameInput = textField(spell?.name ?? '', 'Spell name');
  nameInput.classList.add('inventory-panel__name-input');

  const levelSelect = select(
    ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
    String(spell?.level ?? 0),
  );
  const schoolSelect = select([...SPELL_SCHOOLS], spell?.school ?? SPELL_SCHOOLS[0]);

  // Class list: a checkbox per playable class; the ticked set is the spell's
  // available spell lists.
  const classChecks = CLASS_LIST.map((cls) => {
    const { label, input } = checkbox(cls.name, spell?.classes.includes(cls.id) ?? false);
    input.value = cls.id;
    return { label, input };
  });
  const classesField = labeled(
    'Classes',
    wrapChecks(
      classChecks.map((c) => c.label),
      true,
    ),
  );

  const castingTimeInput = textField(spell?.castingTime ?? '1 action', '1 action');
  const rangeInput = textField(spell?.range ?? 'Self', '60 feet');
  const durationInput = textField(spell?.duration ?? 'Instantaneous', 'Instantaneous');

  const componentChecks = COMPONENTS.map(({ letter, title }) => {
    const check = checkbox(letter, spell?.components.includes(letter) ?? false);
    check.label.title = title;
    return check;
  });
  const componentsField = labeled('Components', wrapChecks(componentChecks.map((c) => c.label)));

  const concentration = checkbox('Concentration', spell?.concentration ?? false);
  const ritual = checkbox('Ritual', spell?.ritual ?? false);

  const descriptionInput = document.createElement('textarea');
  descriptionInput.className = 'field spell-form__description';
  descriptionInput.rows = 3;
  descriptionInput.placeholder = 'What the spell does.';
  descriptionInput.value = spell?.description ?? '';

  // --- Effect section: swaps controls by kind -------------------------------
  const kindSelect = select([...SPELL_EFFECT_KINDS], spell?.effect.kind ?? 'utility');
  const saveEffect = spell?.effect.kind === 'save' ? spell.effect : null;
  const abilitySelect = select([...SPELL_ABILITIES], saveEffect?.saveAbility ?? 'DEX');
  const halfOnSave = checkbox('Half on save', saveEffect?.halfOnSave ?? false);
  const conditionInput = textField(saveEffect?.condition ?? '', 'e.g. Frightened');

  // A save may deal no damage (condition-only), so its damage is gated; attack
  // and heal always carry dice.
  const dealsDamage = checkbox(
    'Deals damage',
    spell?.effect.kind === 'attack' || (saveEffect?.damage.length ?? 0) > 0,
  );
  const effectDamage = buildDamageEditor(
    effectDamageOf(spell?.effect) ?? [{ count: 1, sides: 6, damageType: 'fire' }],
  );
  const damageField = labeled('Damage', effectDamage.element);
  const healField = labeled('Healing', effectDamage.element);

  const abilityField = labeled('Save', abilitySelect);
  const conditionField = labeled('Condition', conditionInput);

  // --- Scaling --------------------------------------------------------------
  const scales = checkbox('Scales per level', !!spell?.scaling);
  const scalingDamage = buildDamageEditor(
    spell?.scaling?.damagePerLevel ?? [{ count: 1, sides: 6, damageType: 'fire' }],
  );
  const scalingDamageField = labeled('Extra dice / level', scalingDamage.element);
  const targetsInput = document.createElement('input');
  targetsInput.type = 'number';
  targetsInput.min = '0';
  targetsInput.className = 'field inventory-panel__quantity-input';
  targetsInput.value = String(spell?.scaling?.targetsPerLevel ?? 0);
  const targetsField = labeled('Extra targets / level', targetsInput);

  const effectRow = fieldRow(labeled('Effect', kindSelect), abilityField);
  // The save's two toggles share a row; the freeform condition gets its own.
  const saveTogglesRow = fieldRow(halfOnSave.label, dealsDamage.label);
  const conditionRow = fieldRow(conditionField);
  const scalingRow = fieldRow(scales.label);
  // Keep the multi-line dice editor and the lone targets number on separate
  // rows; sharing a flex row leaves the small number field floating beside the
  // taller editor.
  const scalingDamageRow = fieldRow(scalingDamageField);
  const scalingTargetsRow = fieldRow(targetsField);

  function syncEffectFields() {
    const kind = kindSelect.value;
    abilityField.hidden = kind !== 'save';
    saveTogglesRow.hidden = kind !== 'save';
    conditionRow.hidden = kind !== 'save';
    // Attack always shows damage; save shows it when "Deals damage" is on; heal
    // shows healing; utility shows neither.
    const showDamage = kind === 'attack' || (kind === 'save' && dealsDamage.input.checked);
    damageField.hidden = !showDamage;
    healField.hidden = kind !== 'heal';
    // The one damage editor element is reused; park it under whichever label is
    // visible.
    if (kind === 'heal') healField.appendChild(effectDamage.element);
    else if (showDamage) damageField.appendChild(effectDamage.element);
  }
  kindSelect.addEventListener('change', syncEffectFields);
  dealsDamage.input.addEventListener('change', syncEffectFields);

  function syncScaling() {
    const hide = !scales.input.checked;
    scalingDamageRow.hidden = hide;
    scalingTargetsRow.hidden = hide;
  }
  scales.input.addEventListener('change', syncScaling);

  const actionsRow = formActions({
    submitLabel,
    onSubmit: () => {
      const name = nameInput.value.trim();
      if (!name) return;
      onSubmit(assemble());
    },
    onCancel,
  });

  /** @returns {Omit<Spell, 'id'>} */
  function assemble() {
    const kind = /** @type {SpellEffect['kind']} */ (kindSelect.value);
    /** @type {SpellEffect} */
    let effect;
    if (kind === 'attack') {
      effect = { kind: 'attack', damage: effectDamage.get() };
    } else if (kind === 'save') {
      const condition = conditionInput.value.trim();
      effect = {
        kind: 'save',
        saveAbility: /** @type {import('../types/spell.js').Ability} */ (abilitySelect.value),
        damage: dealsDamage.input.checked ? effectDamage.get() : [],
        halfOnSave: halfOnSave.input.checked,
        ...(condition ? { condition } : {}),
      };
    } else if (kind === 'heal') {
      effect = { kind: 'heal', healing: effectDamage.get() };
    } else {
      effect = { kind: 'utility' };
    }

    const targets = clampInt(targetsInput.value, 0);
    const scaling = scales.input.checked
      ? {
          ...(scalingDamage.get().length ? { damagePerLevel: scalingDamage.get() } : {}),
          ...(targets > 0 ? { targetsPerLevel: targets } : {}),
        }
      : undefined;

    return {
      name: nameInput.value.trim(),
      level: Number(levelSelect.value),
      school: /** @type {import('../types/spell.js').SpellSchool} */ (schoolSelect.value),
      classes: classChecks.filter((c) => c.input.checked).map((c) => c.input.value),
      castingTime: castingTimeInput.value.trim() || '1 action',
      range: rangeInput.value.trim() || 'Self',
      components: COMPONENTS.filter((_, i) => componentChecks[i].input.checked).map(
        (c) => c.letter,
      ),
      duration: durationInput.value.trim() || 'Instantaneous',
      concentration: concentration.input.checked,
      ritual: ritual.input.checked,
      description: descriptionInput.value.trim(),
      effect,
      ...(scaling && Object.keys(scaling).length ? { scaling } : {}),
    };
  }

  form.append(
    nameInput,
    fieldRow(labeled('Level', levelSelect), labeled('School', schoolSelect)),
    classesField,
    fieldRow(labeled('Casting time', castingTimeInput), labeled('Range', rangeInput)),
    fieldRow(labeled('Duration', durationInput), componentsField),
    fieldRow(concentration.label, ritual.label),
    labeled('Description', descriptionInput),
    effectRow,
    saveTogglesRow,
    conditionRow,
    damageField,
    healField,
    scalingRow,
    scalingDamageRow,
    scalingTargetsRow,
    actionsRow,
  );

  syncEffectFields();
  syncScaling();
  return form;
}

/** Wrap a set of checkbox labels into a group — inline by default, or a
 * multi-column grid when `grid` is set (used for the long class list).
 * @param {HTMLElement[]} labels @param {boolean} [grid] */
function wrapChecks(labels, grid = false) {
  const group = document.createElement('div');
  group.className = grid ? 'spell-form__checks spell-form__checks--grid' : 'spell-form__checks';
  group.append(...labels);
  return group;
}

/** The damage/healing dice on an effect, or null when it carries none.
 * @param {SpellEffect | undefined} effect
 * @returns {import('../types/entities.js').DamagePart[] | null} */
function effectDamageOf(effect) {
  if (!effect) return null;
  if (effect.kind === 'attack') return effect.damage.length ? effect.damage : null;
  if (effect.kind === 'save') return effect.damage.length ? effect.damage : null;
  if (effect.kind === 'heal') return effect.healing.length ? effect.healing : null;
  return null;
}
