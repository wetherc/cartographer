import { ABILITY_SCORES } from '../entities/Character.js';
import {
  ITEM_TYPES,
  ARMOR_WEIGHTS,
  SHIELD_AC,
  WEAPON_TYPES,
  WEAPON_HANDLING,
} from '../entities/Equipment.js';
import { activeEquipment } from '../library/Library.js';
import { buildDamageEditor, buildEffectsEditor } from './ItemFormEditors.js';
import { el } from './dom.js';
import {
  labeled,
  fieldRow,
  textField,
  numberField,
  select,
  setOptions,
  buildInlineForm,
} from './formFields.js';
import {
  assembleItem,
  presetLabel,
  EQUIPPABLE_TYPES,
  FLAT_AC_TYPES,
} from '../entities/ItemDraft.js';

/** @typedef {import('../types/entities.js').InventoryItem} InventoryItem */
/** @typedef {import('../types/entities.js').ItemType} ItemType */
/** @typedef {import('../types/library.js').EquipmentTemplate} EquipmentTemplate */

/**
 * The item create and edit form, shared by the add row and the per-item
 * editor. Every mechanical field is here: type-specific armor, shield,
 * AC, and buff controls, and for weapons and bows a 5e preset picker,
 * handling, which fixes the damage ability, a structured damage-dice
 * editor, base roll plus permanent riders such as + 1d4 fire, and
 * inflicted status effects. The last two build as widgets in
 * ItemFormEditors.js. A submit calls `onSubmit` with the assembled
 * fields, with no id, since the caller owns identity, and clears the form
 * only when adding. Editing keeps the values on screen. If `template` is
 * set, the form describes a reusable blueprint, for the Library rail's
 * editor, rather than a stack in someone's pack. The quantity field is
 * hidden, and submits report quantity 1.
 * @param {{
 *   item?: InventoryItem | null,
 *   submitLabel: string,
 *   onSubmit: (fields: Omit<InventoryItem, 'id'>) => void,
 *   onCancel?: (() => void) | null,
 *   template?: boolean,
 * }} options
 * @returns {HTMLElement}
 */
export function buildItemForm({
  item = null,
  submitLabel,
  onSubmit,
  onCancel = null,
  template = false,
}) {
  const nameInput = textField(item?.name ?? '', 'Item name');

  const descriptionInput = textField(item?.description ?? '', 'Description (optional)', {
    className: 'inventory-panel__name-input',
  });

  const quantityInput = numberField(item?.quantity ?? 1, {
    min: 1,
    className: 'inventory-panel__quantity-input',
  });

  // gear is the catch-all for miscellaneous, non-equippable items, for
  // example rope, rations, and trinkets. The picker states this where the GM picks it.
  const typeSelect = select(
    ITEM_TYPES.map((t) => ({ value: t, label: t === 'gear' ? 'gear (misc.)' : t })),
    item ? (item.type ?? 'gear') : ITEM_TYPES[0],
    { className: 'inventory-panel__type-select' },
  );

  // Body armor has a 5e weight class, which alone fixes the DEX scaling,
  // never the GM's input, and a configurable base AC. The base AC
  // defaults to a representative value for the chosen weight.
  const weightSelect = select(
    ARMOR_WEIGHTS.map((w) => ({
      value: w.key,
      label:
        w.dexCap === 0
          ? `${w.label} (no DEX)`
          : w.dexCap === Infinity
            ? `${w.label} (+ DEX)`
            : `${w.label} (+ DEX, max ${w.dexCap})`,
    })),
    item?.armorWeight ?? ARMOR_WEIGHTS[0].key,
  );
  const baseACInput = numberField(item?.baseAC ?? ARMOR_WEIGHTS[0].defaultBaseAC, {
    min: 1,
    className: 'inventory-panel__ac-input',
  });
  weightSelect.addEventListener('change', () => {
    const weight = ARMOR_WEIGHTS.find((w) => w.key === weightSelect.value);
    if (weight) baseACInput.value = String(weight.defaultBaseAC);
  });
  const weightField = labeled('Weight', weightSelect);
  const baseACField = labeled('Base AC', baseACInput);

  // A shield always adds +2 AC in 5e, so there is no input. The form only
  // states the value.
  const shieldNote = el('span', 'inventory-panel__note', `+${SHIELD_AC} AC`);
  const shieldField = labeled('Shield', shieldNote);

  // A non-armor equippable, for example a helmet, ring, or bow, can carry
  // a flat AC bonus while equipped.
  const acInput = numberField(item?.acBonus ?? 0, {
    min: 0,
    className: 'inventory-panel__ac-input',
  });
  acInput.title = 'Flat AC bonus while equipped';
  const acField = labeled('AC bonus', acInput);

  // Any equippable can buff an ability score while worn, for example +2
  // STR. Only the first stored bonus is editable here. The dash means no buff.
  const [firstBuff] = Object.entries(item?.statBonuses ?? {});
  const buffStatSelect = select(
    [{ value: '', label: '—' }, ...ABILITY_SCORES],
    firstBuff?.[0] ?? '',
  );
  const buffAmountInput = numberField(firstBuff ? Number(firstBuff[1]) : 1, {
    className: 'inventory-panel__ac-input',
  });
  const buffStatField = labeled('Buff', buffStatSelect);
  const buffAmountField = labeled('Amount', buffAmountInput);

  // This is a library preset to start from: the 5e defaults merged with
  // the GM's Library-tab overrides and custom entries. It appears for
  // every type with at least one entry. Picking a preset fills the
  // type's mechanical fields, and the name and description when still
  // blank. Every field stays editable after.
  const CUSTOM_PRESET = { value: '', label: 'Custom' };
  const presetSelect = select([CUSTOM_PRESET], '');
  const presetField = labeled('Preset', presetSelect);

  /** The merged library entries backing a type's picker. An empty result hides the picker.
   * @param {string} type
   * @returns {EquipmentTemplate[]} */
  const presetsFor = (type) => activeEquipment(/** @type {ItemType} */ (type));

  const handlingSelect = select(
    WEAPON_HANDLING.map((h) => ({ value: h.key, label: `${h.label} (${h.ability})` })),
    item?.handling ?? 'melee',
  );
  const handlingField = labeled('Handling', handlingSelect);

  const damage = buildDamageEditor(
    item?.damage ?? [{ count: 1, sides: 6, damageType: 'slashing' }],
  );
  const damageField = labeled('Damage', damage.element);

  // This shows status effects the weapon inflicts, as removable chips plus an add row.
  const effects = buildEffectsEditor(item?.statusEffects ?? []);
  const effectsField = labeled('Inflicts', effects.element);

  presetSelect.addEventListener('change', () => {
    const type = typeSelect.value;
    const preset = presetsFor(type).find((p) => p.name === presetSelect.value);
    if (!preset) return;
    // This fills whichever mechanical fields the template carries. A
    // custom library entry can also bring an AC bonus, a stat buff, or
    // inflicted effects.
    if (preset.damage?.length) {
      handlingSelect.value = preset.handling ?? 'melee';
      damage.set(preset.damage);
    }
    if (preset.armorWeight !== undefined || preset.baseAC !== undefined) {
      weightSelect.value = preset.armorWeight ?? 'light';
      baseACInput.value = String(preset.baseAC ?? 10);
    }
    if (preset.description && !descriptionInput.value.trim()) {
      descriptionInput.value = preset.description;
    }
    if (preset.acBonus !== undefined) acInput.value = String(preset.acBonus);
    if (preset.statusEffects) effects.set(preset.statusEffects);
    const [buff] = Object.entries(preset.statBonuses ?? {});
    if (buff) {
      buffStatSelect.value = buff[0];
      buffAmountInput.value = String(buff[1]);
      syncTypeFields();
    }
    nameInput.value = preset.name;
  });

  // The form lays out as fixed rows: name, description, type and
  // quantity, then the type-specific rows. Toggling a type only shows or
  // hides whole rows. The shared controls never reflow around appearing fields.
  const presetRow = fieldRow(presetField);
  const armorRow = fieldRow(weightField, baseACField, shieldField);
  const weaponRow = fieldRow(handlingField);
  const damageRow = fieldRow(damageField);
  const effectsRow = fieldRow(effectsField);
  // AC bonus is its own row. The stat buff pairs its select with its
  // amount. Keeping them apart avoids a number input and a select sharing
  // a row with mismatched heights, which misaligned their captions.
  const acRow = fieldRow(acField);
  const buffRow = fieldRow(buffStatField, buffAmountField);

  const syncTypeFields = () => {
    const type = typeSelect.value;
    const weaponish = WEAPON_TYPES.includes(type);
    weightField.hidden = baseACField.hidden = type !== 'armor';
    shieldField.hidden = type !== 'shield';
    acField.hidden = !FLAT_AC_TYPES.includes(type);
    buffStatField.hidden = !EQUIPPABLE_TYPES.includes(type);
    buffAmountField.hidden = buffStatField.hidden || buffStatSelect.value === '';
    handlingField.hidden = damageField.hidden = effectsField.hidden = !weaponish;
    armorRow.hidden = weightField.hidden && shieldField.hidden;
    weaponRow.hidden = damageRow.hidden = effectsRow.hidden = !weaponish;
    acRow.hidden = acField.hidden;
    buffRow.hidden = buffStatField.hidden;
    const presets = presetsFor(type);
    presetRow.hidden = presetField.hidden = presets.length === 0;
    if (presets.length > 0) {
      setOptions(
        presetSelect,
        [CUSTOM_PRESET, ...presets.map((p) => ({ value: p.name, label: presetLabel(p) }))],
        '',
      );
    }
  };
  typeSelect.addEventListener('change', syncTypeFields);
  buffStatSelect.addEventListener('change', syncTypeFields);
  syncTypeFields();

  // Reading the controls happens here. Deciding which of their values
  // belong on the item is the job of ItemDraft.
  /** @returns {Omit<InventoryItem, 'id'> | null} */
  const assemble = () =>
    assembleItem({
      name: nameInput.value,
      description: descriptionInput.value,
      quantity: quantityInput.value,
      type: typeSelect.value,
      notes: item?.notes ?? '',
      armorWeight: weightSelect.value,
      baseAC: baseACInput.value,
      acBonus: acInput.value,
      buffStat: buffStatSelect.value,
      buffAmount: buffAmountInput.value,
      handling: handlingSelect.value,
      damage: damage.get(),
      statusEffects: effects.get(),
    });

  return buildInlineForm({
    nameInput,
    rows: [
      descriptionInput,
      // A library template is a blueprint, not a stack. It has no quantity to set.
      template
        ? fieldRow(labeled('Type', typeSelect))
        : fieldRow(labeled('Type', typeSelect), labeled('Qty', quantityInput)),
      presetRow,
      armorRow,
      weaponRow,
      damageRow,
      effectsRow,
      acRow,
      buffRow,
    ],
    assemble,
    submitLabel,
    onSubmit,
    onCancel,
    // The add row keeps taking entries, so it clears itself. The
    // per-item editor keeps the values on screen.
    afterSubmit: item
      ? null
      : () => {
          nameInput.value = '';
          descriptionInput.value = '';
          quantityInput.value = '1';
        },
  });
}
