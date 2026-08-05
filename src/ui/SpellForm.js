import { CLASS_LIST } from '../entities/Classes.js';
import { setTip } from './Tooltip.js';
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
import { MAX_TARGET_COUNT } from '../entities/Casting.js';
import { assembleSpell, effectDamageOf } from '../entities/SpellDraft.js';
import { CONDITIONS } from '../entities/Conditions.js';
import { RIDER_ROLLS, DEFAULT_RIDER_DIE } from '../entities/Riders.js';
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

/** How each casting-time kind reads in the picker. A counted kind also serves
 * as the caption over the amount field beside it. @type {Record<string, string>} */
const CASTING_TIME_LABELS = {
  action: 'Action',
  bonus: 'Bonus action',
  reaction: 'Reaction',
  minutes: 'Minutes',
  hours: 'Hours',
  special: 'Special',
};

/** The same map for durations. @type {Record<string, string>} */
const DURATION_LABELS = {
  instantaneous: 'Instantaneous',
  rounds: 'Rounds',
  minutes: 'Minutes',
  hours: 'Hours',
  days: 'Days',
  'until-dispelled': 'Until dispelled',
  special: 'Special',
};

/** The dice a rider can use. Every rider in the SRD is a d4, and the rest are
 * here so a homebrew spell is not stuck with one. The normalizer accepts any
 * die; this is only what the picker offers. */
const RIDER_DICE = ['d4', 'd6', 'd8', 'd10', 'd12'];

/** The component letters a spell can require, with their 5e meanings. */
const COMPONENTS = [
  { letter: 'V', title: 'Verbal' },
  { letter: 'S', title: 'Somatic' },
  { letter: 'M', title: 'Material' },
];

/**
 * The spell create/edit form, inline in the Library rail like the item form.
 * Every field of a Spell is here: descriptive metadata, a class multi-select,
 * component letters, and an effect section that swaps its inner controls with
 * the chosen effect kind: attack damage, a save with its ability, damage, and
 * condition, heal dice, or nothing for utility. Submit calls `onSubmit`
 * with the assembled spell minus its id, because the caller owns identity and
 * the merge key. An edit of a built-in default stores the result as a custom
 * override.
 * @param {{
 *   spell?: Spell | null,
 *   submitLabel: string,
 *   onSubmit: (spell: Omit<Spell, 'id'>) => void,
 *   onCancel?: (() => void) | null,
 * }} options
 * @returns {HTMLElement}
 */
export function buildSpellForm({ spell = null, submitLabel, onSubmit, onCancel = null }) {
  const nameInput = textField(spell?.name ?? '', { placeholder: 'Spell name' });

  const levelSelect = select(
    ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
    String(spell?.level ?? 0),
  );
  const schoolSelect = select([...SPELL_SCHOOLS], spell?.school ?? SPELL_SCHOOLS[0]);

  // Class list: a checkbox per playable class. The ticked set is the spell's
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

  const rangeInput = textField(spell?.range ?? 'Self', { placeholder: '60 feet' });

  // --- Casting time: a kind, plus whatever fields that kind carries --------
  const castingTime = parseCastingTime(spell?.castingTime ?? '1 action');
  const timeKindSelect = select(
    kindOptions(CASTING_TIME_KINDS, CASTING_TIME_LABELS),
    castingTime.kind,
  );
  const timeAmountInput = numberField(castingTime.amount ?? 1, {
    min: 1,
    className: 'form__number',
  });
  const timeAmountField = labeled('Minutes', timeAmountInput);
  const triggerInput = textField(castingTime.trigger ?? '', {
    placeholder: 'which you take when ...',
  });
  const triggerField = labeled('Reaction to', triggerInput);
  const timeTextInput = textField(castingTime.text ?? '', { placeholder: 'as written' });
  const timeTextField = labeled('Casting time text', timeTextInput);

  // --- Duration: the same shape, plus the "up to" distinction --------------
  const duration = parseDuration(spell?.duration ?? 'Instantaneous');
  const durationKindSelect = select(kindOptions(DURATION_KINDS, DURATION_LABELS), duration.kind);
  const durationAmountInput = numberField(duration.amount ?? 1, {
    min: 1,
    className: 'form__number',
  });
  const durationAmountField = labeled('Rounds', durationAmountInput);
  const upTo = checkbox('Up to', duration.upTo ?? false);
  setTip(upTo.label, 'The caster may end the spell before the time runs out');
  const durationTextInput = textField(duration.text ?? '', { placeholder: 'as written' });
  const durationTextField = labeled('Duration text', durationTextInput);

  const componentChecks = COMPONENTS.map(({ letter, title }) => {
    const check = checkbox(letter, spell?.components.includes(letter) ?? false);
    setTip(check.label, title);
    return check;
  });
  const componentsField = labeled('Components', wrapChecks(componentChecks.map((c) => c.label)));
  const materialCheck = componentChecks[COMPONENTS.findIndex((c) => c.letter === 'M')];

  // What the M component is. The system enforces only a consumed material
  // against the caster's inventory. The cost field is documentation only. The
  // checkbox is the field that changes what a cast does.
  const materialInput = textField(spell?.materials?.text ?? '', {
    placeholder: 'a pinch of sulfur',
  });
  const materialField = labeled('Material', materialInput);
  const materialCostInput = numberField(spell?.materials?.costGP ?? 0, {
    min: 0,
    className: 'form__number',
  });
  const materialCostField = labeled('Cost (gp)', materialCostInput);
  const consumed = checkbox('Consumed on cast', spell?.materials?.consumed ?? false);
  setTip(consumed.label, 'The cast destroys the material, so the caster must be holding it');

  // How many creatures one cast reaches. 0 marks an area spell, where the map,
  // not the spell, decides the count, so the caster picks any number.
  const targetCountInput = numberField(spell?.targetCount ?? 1, {
    min: 0,
    max: MAX_TARGET_COUNT,
    className: 'form__number',
  });
  setTip(targetCountInput, '0 = an area: the caster picks any number of creatures');
  const targetCountField = labeled('Targets', targetCountInput);

  const concentration = checkbox('Concentration', spell?.concentration ?? false);
  const ritual = checkbox('Ritual', spell?.ritual ?? false);

  const descriptionInput = textareaField(spell?.description ?? '', {
    placeholder: 'What the spell does.',
    className: 'spell-form__description',
  });

  // --- Effect section: swaps controls by kind -----------------------------
  const kindSelect = select([...SPELL_EFFECT_KINDS], spell?.effect.kind ?? 'utility');
  const saveEffect = spell?.effect.kind === 'save' ? spell.effect : null;
  // The two kinds that put a chip on a creature. Both carry a condition name
  // and a rider, so both fill the same two controls.
  const chipEffect =
    spell?.effect.kind === 'save' || spell?.effect.kind === 'buff' ? spell.effect : null;
  const abilitySelect = select([...SPELL_ABILITIES], saveEffect?.saveAbility ?? 'DEX');
  const halfOnSave = checkbox('Half on save', saveEffect?.halfOnSave ?? false);
  // The condition the chip is called, picked from the same list the
  // conditions bar offers, so the name always matches a real chip. An
  // imported spell that names something else keeps that name as its own
  // option, and does not lose it.
  const storedCondition = chipEffect?.condition ?? '';
  const conditionSelect = select(
    [
      { value: '', label: 'None' },
      ...(storedCondition && !CONDITIONS.includes(storedCondition) ? [storedCondition] : []),
      ...CONDITIONS,
    ],
    storedCondition,
  );

  // A save can deal no damage and impose only a condition, so its damage is
  // gated. An attack and a heal always carry dice.
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

  // --- Rider: what the imposed chip adds to the target's later rolls -------
  const storedRider = chipEffect?.rider ?? null;
  const riderDiceInput = numberField(storedRider?.dice ?? 0, {
    className: 'form__number',
  });
  setTip(riderDiceInput, 'Negative for a penalty die, as with Bane');
  const riderDiceField = labeled('Rider dice', riderDiceInput);
  const riderDieSelect = select([...RIDER_DICE], storedRider?.die ?? DEFAULT_RIDER_DIE);
  const riderDieField = labeled('Die', riderDieSelect);
  const riderFlatInput = numberField(storedRider?.flat ?? 0, {
    className: 'form__number',
  });
  const riderFlatField = labeled('Flat', riderFlatInput);
  const riderRollChecks = RIDER_ROLLS.map((roll) =>
    checkbox(roll, storedRider?.rolls.includes(roll) ?? false),
  );
  const riderRollsField = labeled(
    'Applies to',
    el('div', 'u-row u-wrap u-g2', ...riderRollChecks.map((c) => c.label)),
  );

  // --- Projectiles: several separately-rolled attacks from one cast -------
  const shots = spell?.effect.kind === 'attack' ? (spell.effect.projectiles ?? null) : null;
  const fires = checkbox('Fires projectiles', !!shots);
  setTip(fires.label, 'Each projectile rolls its own attack and picks its own target');
  const shotCountInput = numberField(shots?.count ?? 1, {
    min: 1,
    max: MAX_TARGET_COUNT,
    className: 'form__number',
  });
  const shotCountField = labeled('Projectiles', shotCountInput);
  const shotPerStepInput = numberField(shots?.perStep ?? 0, {
    min: 0,
    max: MAX_TARGET_COUNT,
    className: 'form__number',
  });
  const shotPerStepField = labeled('Extra / level', shotPerStepInput);
  const autoHit = checkbox('Hits automatically', shots?.autoHit ?? false);
  setTip(autoHit.label, 'No attack roll, as with Magic Missile');

  // --- Scaling -------------------------------------------------------------
  const scales = checkbox('Scales per level', !!spell?.scaling);
  const scalingDamage = buildDamageEditor(
    spell?.scaling?.damagePerLevel ?? [{ count: 1, sides: 6, damageType: 'fire' }],
    heals ? HEALING_TYPE : null,
  );
  const scalingDamageField = labeled('Extra dice / level', scalingDamage.element);
  const targetsInput = numberField(spell?.scaling?.targetsPerLevel ?? 0, {
    min: 0,
    className: 'form__number',
  });
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

  const materialRow = fieldRow(materialField, materialCostField, consumed.label);

  const effectRow = fieldRow(labeled('Effect', kindSelect), abilityField);
  const projectilesRow = fieldRow(fires.label);
  const projectileFieldsRow = fieldRow(shotCountField, shotPerStepField, autoHit.label);
  // The save's two toggles share a row. The condition picker gets its own row.
  const saveTogglesRow = fieldRow(halfOnSave.label, dealsDamage.label);
  const conditionRow = fieldRow(conditionField);
  const riderRow = fieldRow(riderDiceField, riderDieField, riderFlatField);
  const riderRollsRow = fieldRow(riderRollsField);
  const scalingRow = fieldRow(scales.label);
  // Keep the multi-line dice editor and the lone targets number on separate
  // rows. A shared flex row leaves the small number field floating beside the
  // taller editor.
  const scalingDamageRow = fieldRow(scalingDamageField);
  const scalingTargetsRow = fieldRow(targetsField);

  function syncEffectFields() {
    const kind = kindSelect.value;
    abilityField.hidden = kind !== 'save';
    saveTogglesRow.hidden = kind !== 'save';
    // Both kinds that put a chip on a creature pick its name. A buff needs no
    // name (the chip falls back to the spell's own), so its picker offers the
    // same None entry.
    const chips = kind === 'save' || kind === 'buff';
    conditionRow.hidden = !chips;
    // A rider rides a chip. A save keeps one only once it names a condition;
    // a buff always has a chip to carry it.
    const rides = chips && (kind === 'buff' || conditionSelect.value !== '');
    riderRow.hidden = !rides;
    riderRollsRow.hidden = !rides;
    // Only an attack fires projectiles. Their count fields matter only once
    // the attack does.
    projectilesRow.hidden = kind !== 'attack';
    const firesShots = kind === 'attack' && fires.input.checked;
    projectileFieldsRow.hidden = !firesShots;
    // Attack always shows damage. Save shows damage when "Deals damage" is on.
    // Heal shows healing. Utility shows neither. Projectiles change what the
    // dice mean, so the caption states which meaning applies.
    const showDamage = kind === 'attack' || (kind === 'save' && dealsDamage.input.checked);
    setCaption(damageField, firesShots ? 'Damage / projectile' : 'Damage');
    damageField.hidden = !showDamage;
    healField.hidden = kind !== 'heal';
    // Restorative dice are healing, never a damage type. The same rule holds
    // for the per-level dice that add to them.
    const fixed = kind === 'heal' ? HEALING_TYPE : null;
    effectDamage.setFixedType(fixed);
    scalingDamage.setFixedType(fixed);
    // The one damage editor element is reused. Park it under whichever label
    // is visible.
    if (kind === 'heal') healField.appendChild(effectDamage.element);
    else if (showDamage) damageField.appendChild(effectDamage.element);
  }
  kindSelect.addEventListener('change', syncEffectFields);

  // The material fields mean something only under a ticked M. Unticking M
  // drops them from the assembled spell, the same way a switch of effect kind
  // drops the fields the new kind does not carry.
  function syncComponents() {
    materialRow.hidden = !materialCheck.input.checked;
  }
  materialCheck.input.addEventListener('change', syncComponents);

  // Each timing kind shows only what it carries: an amount for a counted
  // kind, a trigger clause for a reaction, or the original text for `special`.
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
  conditionSelect.addEventListener('change', syncEffectFields);

  function syncScaling() {
    const hide = !scales.input.checked;
    scalingDamageRow.hidden = hide;
    scalingTargetsRow.hidden = hide;
  }
  scales.input.addEventListener('change', syncScaling);

  // Both readers hand their raw control values to the parser instead of
  // validating here. This keeps the form and an imported file in agreement
  // on what a timing value can hold.
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

  // Reading the controls is this file's job. Deciding what the values mean is
  // SpellDraft's job. The whole submitted form gathers as plain values and
  // hands over in one piece.
  /** @returns {Omit<Spell, 'id'>} */
  function assemble() {
    return assembleSpell({
      name: nameInput.value,
      level: levelSelect.value,
      school: schoolSelect.value,
      classes: classChecks.filter((c) => c.input.checked).map((c) => c.input.value),
      castingTime: readCastingTime(),
      duration: readDuration(),
      range: rangeInput.value,
      components: COMPONENTS.filter((_, i) => componentChecks[i].input.checked).map(
        (c) => c.letter,
      ),
      materials: materialCheck.input.checked
        ? {
            text: materialInput.value,
            costGP: materialCostInput.value,
            consumed: consumed.input.checked,
          }
        : null,
      concentration: concentration.input.checked,
      ritual: ritual.input.checked,
      description: descriptionInput.value,
      targetCount: targetCountInput.value,
      effect: {
        kind: kindSelect.value,
        damage: effectDamage.get(),
        saveAbility: abilitySelect.value,
        halfOnSave: halfOnSave.input.checked,
        dealsDamage: dealsDamage.input.checked,
        condition: conditionSelect.value,
        rider: {
          rolls: RIDER_ROLLS.filter((_, i) => riderRollChecks[i].input.checked),
          dice: riderDiceInput.value,
          die: riderDieSelect.value,
          flat: riderFlatInput.value,
        },
        fires: fires.input.checked,
        projectiles: {
          count: shotCountInput.value,
          perStep: shotPerStepInput.value,
          autoHit: autoHit.input.checked,
        },
      },
      scaling: scales.input.checked
        ? { damagePerLevel: scalingDamage.get(), targetsPerLevel: targetsInput.value }
        : null,
    });
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
      materialRow,
      fieldRow(targetCountField),
      fieldRow(concentration.label, ritual.label),
      labeled('Description', descriptionInput),
      effectRow,
      projectilesRow,
      projectileFieldsRow,
      saveTogglesRow,
      conditionRow,
      riderRow,
      riderRollsRow,
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
  syncComponents();
  return form;
}

/** The kind picker's options: each kind paired with its human label.
 * @param {readonly string[]} kinds
 * @param {Record<string, string>} labels
 * @returns {{ value: string, label: string }[]} */
function kindOptions(kinds, labels) {
  return kinds.map((kind) => ({ value: kind, label: labels[kind] }));
}

/** Rewrite a captioned field's caption. This lets one amount input name
 * itself 'Minutes' or 'Hours' as the kind beside it changes.
 * @param {HTMLElement} field @param {string} caption */
function setCaption(field, caption) {
  const span = field.querySelector('span');
  if (span) span.textContent = caption;
}

/** Wrap a set of checkbox labels into a group: inline by default, or a
 * multi-column grid when `grid` is set. The grid form serves the long class
 * list.
 * @param {HTMLElement[]} labels @param {boolean} [grid] */
function wrapChecks(labels, grid = false) {
  return el(
    'div',
    classNames(['spell-form__checks', grid && 'spell-form__checks--grid']),
    ...labels,
  );
}
