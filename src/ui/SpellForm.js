import { capitalize } from '../util/text.js';
import { CLASS_LIST } from '../entities/Classes.js';
import { setTip } from './Tooltip.js';
import { SPELL_SCHOOLS, SPELL_ABILITIES, SPELL_EFFECT_KINDS } from '../data/spells.js';
import { classNames, el } from './dom.js';
import { HEALING_TYPE } from '../entities/Equipment.js';
import { buildDamageEditor } from './ItemFormEditors.js';
import { buildLaterTurnControls } from './SpellFormLater.js';
import { buildOnHitControls } from './SpellFormOnHit.js';
import { buildHPControls } from './SpellFormHP.js';
import { buildCureControls } from './SpellFormCure.js';
import { buildTypeControls } from './SpellFormTypes.js';
import { buildBuffControls } from './SpellFormBuff.js';
import { buildChipModControls } from './SpellFormChipMods.js';
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
import { MAX_TARGET_COUNT } from '../entities/SpellNormalize.js';
import { activeCreatures } from '../library/Library.js';
import { assembleSpell, effectDamageOf } from '../entities/SpellDraft.js';
import { CONDITIONS } from '../entities/Conditions.js';
import { buildTimingControls, setCaption } from './SpellFormTiming.js';
import { buildRiderControls } from './SpellFormRider.js';
import { buildScalingControls } from './SpellFormScaling.js';

/** @typedef {import('../types/spell.js').Spell} Spell */
/** @typedef {import('../types/spell.js').SpellEffect} SpellEffect */

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
  const nameInput = textField(spell?.name ?? '', {
    placeholder: 'Spell name',
    ariaLabel: 'Spell name',
  });

  // The select values stay the stored words, and the labels read as
  // sentence case ("Cantrip", "Evocation").
  const levelSelect = select(
    ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].map((value) => ({
      value,
      label: value === '0' ? 'Cantrip' : value,
    })),
    String(spell?.level ?? 0),
  );
  const schoolSelect = select(
    SPELL_SCHOOLS.map((value) => ({ value, label: capitalize(value) })),
    spell?.school ?? SPELL_SCHOOLS[0],
  );

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
  const timing = buildTimingControls(spell);

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
  const kindSelect = select(
    SPELL_EFFECT_KINDS.map((value) => ({ value, label: capitalize(value) })),
    spell?.effect.kind ?? 'utility',
  );
  const saveEffect = spell?.effect.kind === 'save' ? spell.effect : null;
  // The two kinds that put a chip on a creature. Both keep a condition name,
  // so both fill the same condition picker.
  const chipEffect =
    spell?.effect.kind === 'save' || spell?.effect.kind === 'buff' ? spell.effect : null;
  const abilitySelect = select([...SPELL_ABILITIES], saveEffect?.saveAbility ?? 'DEX');
  const halfOnSave = checkbox('Half on save', saveEffect?.halfOnSave ?? false);
  // A held target repeats the save at the end of each of its turns and
  // ends the condition on a success (Hold Person).
  const saveEnds = checkbox('Save ends each turn', saveEffect?.saveEnds ?? false);
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
  // A heal adds the modifier to its healing, and an attack to each hit.
  const addsModifier = checkbox(
    'Add spellcasting modifier',
    (spell?.effect.kind === 'heal' || spell?.effect.kind === 'attack') &&
      spell.effect.addsModifier === true,
  );
  const revives = checkbox(
    'Raises the dead',
    spell?.effect.kind === 'heal' && spell.effect.revives === true,
  );
  const stabilizes = checkbox(
    'Stabilizes the dying',
    spell?.effect.kind === 'heal' && spell.effect.stabilizes === true,
  );
  const later = buildLaterTurnControls(spell);
  const onHit = buildOnHitControls(spell);
  const hp = buildHPControls(spell);
  const cure = buildCureControls(spell);
  const types = buildTypeControls(spell);
  const buff = buildBuffControls(spell);
  // The chip that a failed save leaves can slant attacks and resist damage
  // too (Vicious Mockery).
  const saveChip = buildChipModControls(saveEffect?.mods ?? {});
  const rider = buildRiderControls(spell);
  const effectDamage = buildDamageEditor(
    effectDamageOf(spell?.effect) ?? [{ count: 1, sides: 6, damageType: 'fire' }],
    heals ? HEALING_TYPE : null,
  );
  const damageField = labeled('Damage', effectDamage.element);
  const healField = labeled('Healing', effectDamage.element);

  const abilityField = labeled('Save', abilitySelect);
  const conditionField = labeled('Condition', conditionSelect);

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

  // --- Summons: which creature template a cast spawns, and how many --------
  // The picker lists the merged library templates by name, because the name is
  // the merge key. An entry that names a template the library no longer
  // carries keeps that name as its own option, so editing the spell does not
  // silently repoint it.
  const summonEffect = spell?.effect.kind === 'summons' ? spell.effect : null;
  const storedCreature = summonEffect?.creature ?? '';
  const templateNames = activeCreatures().map((t) => t.name);
  const creatureSelect = select(
    [
      { value: '', label: 'None' },
      ...(storedCreature && !templateNames.includes(storedCreature) ? [storedCreature] : []),
      ...templateNames,
    ],
    storedCreature,
  );
  const creatureField = labeled('Creature', creatureSelect);
  const summonCountInput = numberField(summonEffect?.count ?? 1, {
    min: 1,
    max: MAX_TARGET_COUNT,
    className: 'form__number',
  });
  const summonCountField = labeled('How many', summonCountInput);
  const summonPerStepInput = numberField(summonEffect?.countPerStep ?? 0, {
    min: 0,
    max: MAX_TARGET_COUNT,
    className: 'form__number',
  });
  const summonPerStepField = labeled('Extra / level', summonPerStepInput);

  const scaling = buildScalingControls(spell);

  const materialRow = fieldRow(materialField, materialCostField, consumed.label);

  const effectRow = fieldRow(labeled('Effect', kindSelect), abilityField);
  const projectilesRow = fieldRow(fires.label);
  const projectileFieldsRow = fieldRow(shotCountField, shotPerStepField, autoHit.label);
  const summonsRow = fieldRow(creatureField, summonCountField, summonPerStepField);
  // The save's two toggles share a row. The condition picker gets its own row.
  const saveTogglesRow = fieldRow(halfOnSave.label, dealsDamage.label);
  const conditionRow = fieldRow(conditionField);
  const saveEndsRow = fieldRow(saveEnds.label);
  const healTogglesRow = fieldRow(addsModifier.label, revives.label, stabilizes.label);

  function syncEffectFields() {
    const kind = kindSelect.value;
    abilityField.hidden = kind !== 'save';
    saveTogglesRow.hidden = kind !== 'save';
    // Both kinds that put a chip on a creature pick its name. A buff needs no
    // name (the chip falls back to the spell's own), so its picker offers the
    // same None entry.
    const chips = kind === 'save' || kind === 'buff';
    conditionRow.hidden = !chips;
    // A repeated save ends a condition, so it shows once a save names one.
    saveEndsRow.hidden = kind !== 'save' || conditionSelect.value === '';
    rider.sync(kind, conditionSelect.value !== '');
    // Only an attack fires projectiles. Their count fields matter only once
    // the attack does.
    projectilesRow.hidden = kind !== 'attack';
    const firesShots = kind === 'attack' && fires.input.checked;
    projectileFieldsRow.hidden = !firesShots;
    // Only a summons names a creature template.
    summonsRow.hidden = kind !== 'summons';
    // Attack always shows damage. Save shows damage when "Deals damage" is on.
    // Heal shows healing. Utility shows neither. Projectiles change what the
    // dice mean, so the caption states which meaning applies.
    const showDamage = kind === 'attack' || (kind === 'save' && dealsDamage.input.checked);
    setCaption(damageField, firesShots ? 'Damage / projectile' : 'Damage');
    damageField.hidden = !showDamage;
    healField.hidden = kind !== 'heal';
    healTogglesRow.hidden = kind !== 'heal' && kind !== 'attack';
    revives.label.hidden = kind !== 'heal';
    stabilizes.label.hidden = kind !== 'heal';
    later.sync(kind, conditionSelect.value !== '');
    onHit.sync(kind);
    hp.sync(kind, conditionSelect.value !== '');
    cure.sync(kind);
    types.sync(kind);
    buff.sync(kind);
    saveChip.rows.slants.hidden = saveChip.rows.resist.hidden = saveEndsRow.hidden;
    // Restorative dice are healing, never a damage type. The same rule holds
    // for the per-level dice that add to them.
    const fixed = kind === 'heal' ? HEALING_TYPE : null;
    effectDamage.setFixedType(fixed);
    scaling.setFixedType(fixed);
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

  dealsDamage.input.addEventListener('change', syncEffectFields);
  fires.input.addEventListener('change', syncEffectFields);
  conditionSelect.addEventListener('change', syncEffectFields);
  later.listen(syncEffectFields);
  onHit.listen(syncEffectFields);
  hp.listen(syncEffectFields);

  // Reading the controls is this file's job. Deciding what the values mean is
  // SpellDraft's job. The whole submitted form gathers as plain values and
  // hands over in one piece.
  /** @returns {Omit<Spell, 'id'>} */
  function assemble() {
    const extra = later.read();
    return assembleSpell({
      name: nameInput.value,
      level: levelSelect.value,
      school: schoolSelect.value,
      classes: classChecks.filter((c) => c.input.checked).map((c) => c.input.value),
      ...timing.read(),
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
        saveEnds: saveEnds.input.checked,
        addsModifier: addsModifier.input.checked,
        revives: revives.input.checked,
        stabilizes: stabilizes.input.checked,
        dealsDamage: dealsDamage.input.checked,
        condition: conditionSelect.value,
        rider: rider.read(),
        fires: fires.input.checked,
        projectiles: {
          count: shotCountInput.value,
          perStep: shotPerStepInput.value,
          autoHit: autoHit.input.checked,
        },
        summons: {
          creature: creatureSelect.value,
          count: summonCountInput.value,
          countPerStep: summonPerStepInput.value,
        },
        ...extra.effect,
        ...onHit.read(),
        ...hp.read(),
        ...cure.read(),
        ...types.read(),
        ...buff.read(),
        // The buff rows read the mods of every kind, so a save's chip mods
        // replace them here, or an edit of a save spell drops its mods.
        ...(kindSelect.value === 'save' ? { mods: saveChip.read() } : {}),
      },
      scaling: scaling.read(),
      repeat: extra.repeat,
    });
  }

  const form = buildInlineForm({
    nameInput,
    nameLabel: 'Name',
    rows: [
      fieldRow(labeled('Level', levelSelect), labeled('School', schoolSelect)),
      classesField,
      timing.rows.casting,
      timing.rows.trigger,
      timing.rows.duration,
      fieldRow(labeled('Range', rangeInput), componentsField),
      materialRow,
      fieldRow(targetCountField),
      fieldRow(concentration.label, ritual.label),
      labeled('Description', descriptionInput),
      effectRow,
      projectilesRow,
      projectileFieldsRow,
      later.rows.attack,
      onHit.rows.imposes,
      onHit.rows.onHit,
      onHit.rows.onHitUntil,
      onHit.rows.onHitSlants,
      onHit.rows.onHitResist,
      ...onHit.typedRows,
      onHit.rows.drain,
      summonsRow,
      saveTogglesRow,
      conditionRow,
      saveEndsRow,
      saveChip.rows.slants,
      saveChip.rows.resist,
      hp.rows.limit,
      hp.rows.kills,
      hp.rows.pools,
      hp.rows.pool,
      hp.rows.endsOnDamage,
      types.rows.skip,
      types.rows.only,
      types.rows.immune,
      types.rows.disadvantage,
      types.rows.maxDamage,
      later.rows.until,
      buff.rows.ac,
      buff.rows.hp,
      buff.rows.temp,
      buff.rows.turn,
      buff.rows.hit,
      buff.rows.slants,
      buff.rows.resist,
      buff.rows.resistPick,
      rider.rows.dice,
      rider.rows.rolls,
      rider.rows.once,
      damageField,
      healField,
      healTogglesRow,
      cure.row,
      later.rows.lingers,
      later.rows.ongoing,
      later.rows.ongoingMore,
      later.rows.ongoingUntil,
      scaling.rows.toggle,
      scaling.rows.damage,
      scaling.rows.targets,
      later.rows.repeats,
      later.rows.repeat,
      later.rows.repeatDamage,
    ],
    assemble,
    submitLabel,
    onSubmit,
    onCancel,
    className: 'spell-form',
  });

  syncEffectFields();
  syncComponents();
  return form;
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
