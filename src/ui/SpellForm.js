import { CLASS_LIST } from '../entities/Classes.js';
import { SPELL_SCHOOLS, SPELL_ABILITIES, SPELL_EFFECT_KINDS } from '../data/spells.js';
import { classNames, el } from './dom.js';
import { HEALING_TYPE } from '../entities/Equipment.js';
import { buildDamageEditor } from './ItemFormEditors.js';
import {
  labeled,
  fieldRow,
  checkbox,
  textField,
  numberField,
  textareaField,
  select,
  buildInlineForm,
} from './formFields.js';
import { clampInt } from '../util/num.js';
import {
  MAX_TARGET_COUNT,
  normalizeProjectiles,
  normalizeTargetCount,
} from '../entities/Casting.js';
import { CONDITIONS } from '../entities/Conditions.js';
import {
  CASTING_TIME_KINDS,
  DURATION_KINDS,
  TIMED_CASTING_KINDS,
  TIMED_DURATION_KINDS,
  parseCastingTime,
  parseDuration,
} from '../entities/SpellTiming.js';

/** @typedef {import('../types/spell.js').Spell} Spell */
/** @typedef {import('../types/spell.js').SpellEffect} SpellEffect */

/** How each casting-time kind reads in the picker. The counted kinds double as
 * the caption over the amount field beside it. @type {Record<string, string>} */
const CASTING_TIME_LABELS = {
  action: 'Action',
  bonus: 'Bonus action',
  reaction: 'Reaction',
  minutes: 'Minutes',
  hours: 'Hours',
  special: 'Special',
};

/** The same for durations. @type {Record<string, string>} */
const DURATION_LABELS = {
  instantaneous: 'Instantaneous',
  rounds: 'Rounds',
  minutes: 'Minutes',
  hours: 'Hours',
  days: 'Days',
  'until-dispelled': 'Until dispelled',
  special: 'Special',
};

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
  const nameInput = textField(spell?.name ?? '', 'Spell name');

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

  const rangeInput = textField(spell?.range ?? 'Self', '60 feet');

  // --- Casting time: a kind, plus whatever that kind carries ----------------
  const castingTime = parseCastingTime(spell?.castingTime ?? '1 action');
  const timeKindSelect = select(
    kindOptions(CASTING_TIME_KINDS, CASTING_TIME_LABELS),
    castingTime.kind,
  );
  const timeAmountInput = numberField(castingTime.amount ?? 1, {
    min: 1,
    className: 'inventory-panel__quantity-input',
  });
  const timeAmountField = labeled('Minutes', timeAmountInput);
  const triggerInput = textField(castingTime.trigger ?? '', 'which you take when ...');
  const triggerField = labeled('Reaction to', triggerInput);
  const timeTextInput = textField(castingTime.text ?? '', 'as written');
  const timeTextField = labeled('Casting time text', timeTextInput);

  // --- Duration: the same shape, plus the "up to" distinction ---------------
  const duration = parseDuration(spell?.duration ?? 'Instantaneous');
  const durationKindSelect = select(kindOptions(DURATION_KINDS, DURATION_LABELS), duration.kind);
  const durationAmountInput = numberField(duration.amount ?? 1, {
    min: 1,
    className: 'inventory-panel__quantity-input',
  });
  const durationAmountField = labeled('Rounds', durationAmountInput);
  const upTo = checkbox('Up to', duration.upTo ?? false);
  upTo.label.title = 'The caster may end the spell before the time runs out';
  const durationTextInput = textField(duration.text ?? '', 'as written');
  const durationTextField = labeled('Duration text', durationTextInput);

  const componentChecks = COMPONENTS.map(({ letter, title }) => {
    const check = checkbox(letter, spell?.components.includes(letter) ?? false);
    check.label.title = title;
    return check;
  });
  const componentsField = labeled('Components', wrapChecks(componentChecks.map((c) => c.label)));

  // How many creatures one cast reaches. 0 marks an area spell, where the count
  // depends on the map rather than the spell, so the caster picks any number.
  const targetCountInput = numberField(spell?.targetCount ?? 1, {
    min: 0,
    max: MAX_TARGET_COUNT,
    className: 'inventory-panel__quantity-input',
  });
  targetCountInput.title = '0 = an area: the caster picks any number of creatures';
  const targetCountField = labeled('Targets', targetCountInput);

  const concentration = checkbox('Concentration', spell?.concentration ?? false);
  const ritual = checkbox('Ritual', spell?.ritual ?? false);

  const descriptionInput = textareaField(spell?.description ?? '', {
    placeholder: 'What the spell does.',
  });
  descriptionInput.classList.add('spell-form__description');

  // --- Effect section: swaps controls by kind -------------------------------
  const kindSelect = select([...SPELL_EFFECT_KINDS], spell?.effect.kind ?? 'utility');
  const saveEffect = spell?.effect.kind === 'save' ? spell.effect : null;
  const abilitySelect = select([...SPELL_ABILITIES], saveEffect?.saveAbility ?? 'DEX');
  const halfOnSave = checkbox('Half on save', saveEffect?.halfOnSave ?? false);
  // The condition a failed save imposes, picked from the same list the
  // conditions bar offers so the name always matches a real chip. An imported
  // spell naming something else keeps it as its own option rather than losing it.
  const storedCondition = saveEffect?.condition ?? '';
  const conditionSelect = select(
    [
      { value: '', label: 'None' },
      ...(storedCondition && !CONDITIONS.includes(storedCondition) ? [storedCondition] : []),
      ...CONDITIONS,
    ],
    storedCondition,
  );

  // A save may deal no damage (condition-only), so its damage is gated; attack
  // and heal always carry dice.
  const dealsDamage = checkbox(
    'Deals damage',
    spell?.effect.kind === 'attack' || (saveEffect?.damage.length ?? 0) > 0,
  );
  const heals = spell?.effect.kind === 'heal';
  const effectDamage = buildDamageEditor(
    effectDamageOf(spell?.effect) ?? [{ count: 1, sides: 6, damageType: 'fire' }],
    heals ? HEALING_TYPE : null,
  );
  const damageField = labeled('Damage', effectDamage.element);
  const healField = labeled('Healing', effectDamage.element);

  const abilityField = labeled('Save', abilitySelect);
  const conditionField = labeled('Condition', conditionSelect);

  // --- Projectiles: several separately-rolled attacks from one cast ----------
  const shots = spell?.effect.kind === 'attack' ? (spell.effect.projectiles ?? null) : null;
  const fires = checkbox('Fires projectiles', !!shots);
  fires.label.title = 'Each projectile rolls its own attack and picks its own target';
  const shotCountInput = numberField(shots?.count ?? 1, {
    min: 1,
    max: MAX_TARGET_COUNT,
    className: 'inventory-panel__quantity-input',
  });
  const shotCountField = labeled('Projectiles', shotCountInput);
  const shotPerStepInput = numberField(shots?.perStep ?? 0, {
    min: 0,
    max: MAX_TARGET_COUNT,
    className: 'inventory-panel__quantity-input',
  });
  const shotPerStepField = labeled('Extra / level', shotPerStepInput);
  const autoHit = checkbox('Hits automatically', shots?.autoHit ?? false);
  autoHit.label.title = 'No attack roll, as with Magic Missile';

  // --- Scaling --------------------------------------------------------------
  const scales = checkbox('Scales per level', !!spell?.scaling);
  const scalingDamage = buildDamageEditor(
    spell?.scaling?.damagePerLevel ?? [{ count: 1, sides: 6, damageType: 'fire' }],
    heals ? HEALING_TYPE : null,
  );
  const scalingDamageField = labeled('Extra dice / level', scalingDamage.element);
  const targetsInput = numberField(spell?.scaling?.targetsPerLevel ?? 0, { min: 0 });
  targetsInput.classList.add('inventory-panel__quantity-input');
  const targetsField = labeled('Extra targets / level', targetsInput);

  const castingRow = fieldRow(
    labeled('Casting time', timeKindSelect),
    timeAmountField,
    timeTextField,
  );
  const triggerRow = fieldRow(triggerField);
  const durationRow = fieldRow(
    labeled('Duration', durationKindSelect),
    durationAmountField,
    upTo.label,
    durationTextField,
  );

  const effectRow = fieldRow(labeled('Effect', kindSelect), abilityField);
  const projectilesRow = fieldRow(fires.label);
  const projectileFieldsRow = fieldRow(shotCountField, shotPerStepField, autoHit.label);
  // The save's two toggles share a row; the condition picker gets its own.
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
    // Only an attack fires projectiles, and their count fields only matter once
    // it does.
    projectilesRow.hidden = kind !== 'attack';
    const firesShots = kind === 'attack' && fires.input.checked;
    projectileFieldsRow.hidden = !firesShots;
    // Attack always shows damage; save shows it when "Deals damage" is on; heal
    // shows healing; utility shows neither. Projectiles change what the dice
    // mean, so the caption says which.
    const showDamage = kind === 'attack' || (kind === 'save' && dealsDamage.input.checked);
    setCaption(damageField, firesShots ? 'Damage / projectile' : 'Damage');
    damageField.hidden = !showDamage;
    healField.hidden = kind !== 'heal';
    // Restorative dice are healing, never a damage type, and the same holds for
    // the per-level dice that add to them.
    const fixed = kind === 'heal' ? HEALING_TYPE : null;
    effectDamage.setFixedType(fixed);
    scalingDamage.setFixedType(fixed);
    // The one damage editor element is reused; park it under whichever label is
    // visible.
    if (kind === 'heal') healField.appendChild(effectDamage.element);
    else if (showDamage) damageField.appendChild(effectDamage.element);
  }
  kindSelect.addEventListener('change', syncEffectFields);

  // Each timing kind shows only what it carries: an amount for the counted
  // kinds, a trigger clause for a reaction, the original text for `special`.
  function syncTiming() {
    const timeKind = timeKindSelect.value;
    const timed = TIMED_CASTING_KINDS.includes(
      /** @type {import('../types/spell.js').CastingTime['kind']} */ (timeKind),
    );
    timeAmountField.hidden = !timed;
    if (timed) setCaption(timeAmountField, CASTING_TIME_LABELS[timeKind]);
    triggerRow.hidden = timeKind !== 'reaction';
    timeTextField.hidden = timeKind !== 'special';

    const durationKind = durationKindSelect.value;
    const durationTimed = TIMED_DURATION_KINDS.includes(
      /** @type {import('../types/spell.js').SpellDuration['kind']} */ (durationKind),
    );
    durationAmountField.hidden = !durationTimed;
    upTo.label.hidden = !durationTimed;
    if (durationTimed) setCaption(durationAmountField, DURATION_LABELS[durationKind]);
    durationTextField.hidden = durationKind !== 'special';
  }
  timeKindSelect.addEventListener('change', syncTiming);
  durationKindSelect.addEventListener('change', syncTiming);
  dealsDamage.input.addEventListener('change', syncEffectFields);
  fires.input.addEventListener('change', syncEffectFields);

  function syncScaling() {
    const hide = !scales.input.checked;
    scalingDamageRow.hidden = hide;
    scalingTargetsRow.hidden = hide;
  }
  scales.input.addEventListener('change', syncScaling);

  // Both readers hand their raw control values to the parser rather than
  // validating here, so the form and an imported file agree on what a timing
  // value may hold.
  /** @returns {import('../types/spell.js').CastingTime} */
  function readCastingTime() {
    const kind = timeKindSelect.value;
    return parseCastingTime({
      kind,
      amount: timeAmountInput.value,
      trigger: triggerInput.value.trim(),
      text: timeTextInput.value.trim(),
    });
  }

  /** @returns {import('../types/spell.js').SpellDuration} */
  function readDuration() {
    return parseDuration({
      kind: durationKindSelect.value,
      amount: durationAmountInput.value,
      upTo: upTo.input.checked,
      text: durationTextInput.value.trim(),
    });
  }

  /** @returns {Omit<Spell, 'id'>} */
  function assemble() {
    const kind = /** @type {SpellEffect['kind']} */ (kindSelect.value);
    /** @type {SpellEffect} */
    let effect;
    if (kind === 'attack') {
      // The parser decides what a written projectile block means, the same way
      // an imported entry's is read, so an unusable one drops out rather than
      // becoming a spell that fires nothing.
      const projectiles = fires.input.checked
        ? normalizeProjectiles({
            count: shotCountInput.value,
            perStep: shotPerStepInput.value,
            autoHit: autoHit.input.checked,
          })
        : null;
      effect = {
        kind: 'attack',
        damage: effectDamage.get(),
        ...(projectiles ? { projectiles } : {}),
      };
    } else if (kind === 'save') {
      const condition = conditionSelect.value.trim();
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
      castingTime: readCastingTime(),
      range: rangeInput.value.trim() || 'Self',
      components: COMPONENTS.filter((_, i) => componentChecks[i].input.checked).map(
        (c) => c.letter,
      ),
      duration: readDuration(),
      concentration: concentration.input.checked,
      ritual: ritual.input.checked,
      description: descriptionInput.value.trim(),
      targetCount: normalizeTargetCount(targetCountInput.value),
      effect,
      ...(scaling && Object.keys(scaling).length ? { scaling } : {}),
    };
  }

  const form = buildInlineForm({
    nameInput,
    rows: [
      fieldRow(labeled('Level', levelSelect), labeled('School', schoolSelect)),
      classesField,
      castingRow,
      triggerRow,
      durationRow,
      fieldRow(labeled('Range', rangeInput), componentsField),
      fieldRow(targetCountField),
      fieldRow(concentration.label, ritual.label),
      labeled('Description', descriptionInput),
      effectRow,
      projectilesRow,
      projectileFieldsRow,
      saveTogglesRow,
      conditionRow,
      damageField,
      healField,
      scalingRow,
      scalingDamageRow,
      scalingTargetsRow,
    ],
    assemble,
    submitLabel,
    onSubmit,
    onCancel,
    className: 'spell-form',
  });

  syncEffectFields();
  syncTiming();
  syncScaling();
  return form;
}

/** The kind picker's options: each kind with its human label.
 * @param {readonly string[]} kinds
 * @param {Record<string, string>} labels
 * @returns {{ value: string, label: string }[]} */
function kindOptions(kinds, labels) {
  return kinds.map((kind) => ({ value: kind, label: labels[kind] }));
}

/** Rewrite a captioned field's caption, so one amount input can name itself
 * 'Minutes' or 'Hours' as the kind beside it changes.
 * @param {HTMLElement} field @param {string} caption */
function setCaption(field, caption) {
  const span = field.querySelector('span');
  if (span) span.textContent = caption;
}

/** Wrap a set of checkbox labels into a group — inline by default, or a
 * multi-column grid when `grid` is set (used for the long class list).
 * @param {HTMLElement[]} labels @param {boolean} [grid] */
function wrapChecks(labels, grid = false) {
  return el(
    'div',
    classNames(['spell-form__checks', grid && 'spell-form__checks--grid']),
    ...labels,
  );
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
