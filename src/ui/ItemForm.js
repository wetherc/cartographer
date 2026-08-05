import { ABILITY_SCORES } from '../entities/Character.js';
import { setTip } from './Tooltip.js';
import { ITEM_TYPES, ARMOR_WEIGHTS, SHIELD_AC, WEAPON_TYPES } from '../entities/Equipment.js';
import { WEAPON_KINDS, WEAPON_PROPERTIES } from '../entities/Weapons.js';
import { activeEquipment } from '../library/Library.js';
import { buildDamageEditor, buildEffectsEditor } from './ItemFormEditors.js';
import { el } from './dom.js';
import {
  labeled,
  checkbox,
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
 * the category, kind, and property flags, a structured damage-dice
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
  const nameInput = textField(item?.name ?? '', { placeholder: 'Item name' });

  const descriptionInput = textField(item?.description ?? '', {
    placeholder: 'Description (optional)',
    className: 'form__wide',
  });

  const quantityInput = numberField(item?.quantity ?? 1, {
    min: 1,
    className: 'form__number',
  });

  // gear is the catch-all for miscellaneous, non-equippable items, for
  // example rope, rations, and trinkets. The picker states this where the GM picks it.
  const typeSelect = select(
    ITEM_TYPES.map((t) => ({ value: t, label: t === 'gear' ? 'gear (misc.)' : t })),
    item ? (item.type ?? 'gear') : ITEM_TYPES[0],
    { className: 'item-form__type-select' },
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
    className: 'form__number',
  });
  weightSelect.addEventListener('change', () => {
    const weight = ARMOR_WEIGHTS.find((w) => w.key === weightSelect.value);
    if (weight) baseACInput.value = String(weight.defaultBaseAC);
  });
  const weightField = labeled('Weight', weightSelect);
  const baseACField = labeled('Base AC', baseACInput);

  // A non-armor equippable, for example a helmet, ring, bow, or shield, can
  // carry a flat AC bonus while equipped. A shield uses the same field, so
  // the 5e +2 is a default and not a fixed rule.
  const acInput = numberField(item?.acBonus ?? 0, {
    min: 0,
    className: 'form__number',
  });
  setTip(acInput, 'Flat AC bonus while equipped');
  const acField = labeled('AC bonus', acInput);

  // A shield that stores no bonus reads as +2, so the field must never hold
  // a zero for one. The minimum keeps the GM from typing one, and switching
  // the type to shield fills the standard value.
  //
  // The fill is taken back off when the type moves away from shield, unless
  // the GM edited it. Without that, choosing shield and then ring would leave
  // the +2 behind and give the ring an AC bonus nobody asked for.
  let filledForShield = false;
  acInput.addEventListener('input', () => {
    filledForShield = false;
  });
  const syncShieldAC = () => {
    const shield = typeSelect.value === 'shield';
    acInput.min = shield ? '1' : '0';
    if (shield && !(Number(acInput.value) >= 1)) {
      acInput.value = String(SHIELD_AC);
      filledForShield = true;
    } else if (!shield && filledForShield) {
      acInput.value = '0';
      filledForShield = false;
    }
  };

  // Any equippable can buff an ability score while worn, for example +2
  // STR. Only the first stored bonus is editable here. The dash means no buff.
  const [firstBuff] = Object.entries(item?.statBonuses ?? {});
  const buffStatSelect = select(
    [{ value: '', label: '—' }, ...ABILITY_SCORES],
    firstBuff?.[0] ?? '',
  );
  const buffAmountInput = numberField(firstBuff ? Number(firstBuff[1]) : 1, {
    className: 'form__number',
  });
  const buffStatField = labeled('Buff', buffStatSelect);
  const buffAmountField = labeled('Amount', buffAmountInput);

  // A component pouch or a spellcasting focus. Carrying one covers a spell's
  // cost-free material component. Every type offers the box, because a staff
  // is an arcane focus and an amulet is a holy symbol.
  const focusBox = checkbox('Component pouch or spellcasting focus', item?.spellFocus ?? false);
  const focusField = labeled('Casting', focusBox.label);

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

  // A weapon's 5e classification. The category decides proficiency: a
  // character proficient with 'simple' or 'martial' weapons adds the
  // proficiency bonus. No category means a natural weapon, for example a
  // bite. The kind decides the attack ability: ranged uses DEX.
  const categorySelect = select(
    [
      { value: 'simple', label: 'Simple' },
      { value: 'martial', label: 'Martial' },
      { value: '', label: 'None (natural weapon)' },
    ],
    item?.category ?? 'simple',
  );
  const categoryField = labeled('Category', categorySelect);
  const kindSelect = select(
    WEAPON_KINDS.map((k) => ({ value: k.key, label: k.label })),
    item?.kind ?? 'melee',
  );
  const kindField = labeled('Kind', kindSelect);

  // One checkbox per 5e weapon property. The versatile box shows the
  // two-handed damage editor, and the thrown box shows the range fields.
  const propertyBoxes = WEAPON_PROPERTIES.map((p) => ({
    key: p.key,
    box: checkbox(p.label, item?.properties?.includes(p.key) ?? false),
  }));
  const propertiesWrap = el('div', 'item-form__properties');
  for (const { box } of propertyBoxes) propertiesWrap.appendChild(box.label);
  const propertiesField = labeled('Properties', propertiesWrap);
  const checkedProperties = () => propertyBoxes.filter((p) => p.box.input.checked);
  /** @param {string[]} keys */
  const setProperties = (keys) => {
    for (const p of propertyBoxes) p.box.input.checked = keys.includes(p.key);
  };

  // The normal and long range in feet, shown for a ranged or thrown weapon.
  const rangeNormalInput = numberField(item?.range?.normal ?? 20, {
    min: 1,
    className: 'form__number',
  });
  const rangeLongInput = numberField(item?.range?.long ?? 60, {
    min: 1,
    className: 'form__number',
  });
  const rangeNormalField = labeled('Range (ft)', rangeNormalInput);
  const rangeLongField = labeled('Long', rangeLongInput);

  const damage = buildDamageEditor(
    item?.damage ?? [{ count: 1, sides: 6, damageType: 'slashing' }],
  );
  const damageField = labeled('Damage', damage.element);

  // The alternate damage dice of a versatile weapon, rolled when it is
  // held in two hands.
  const versatileDamage = buildDamageEditor(
    item?.versatileDamage ?? [{ count: 1, sides: 8, damageType: 'slashing' }],
  );
  const versatileField = labeled('Two-handed damage', versatileDamage.element);

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
      categorySelect.value = preset.category ?? '';
      kindSelect.value = preset.kind ?? 'melee';
      setProperties(preset.properties ?? []);
      rangeNormalInput.value = String(preset.range?.normal ?? 20);
      rangeLongInput.value = String(preset.range?.long ?? 60);
      if (preset.versatileDamage?.length) versatileDamage.set(preset.versatileDamage);
      damage.set(preset.damage);
      syncWeaponFields();
    }
    if (preset.armorWeight !== undefined || preset.baseAC !== undefined) {
      weightSelect.value = preset.armorWeight ?? 'light';
      baseACInput.value = String(preset.baseAC ?? 10);
    }
    if (preset.description && !descriptionInput.value.trim()) {
      descriptionInput.value = preset.description;
    }
    if (preset.acBonus !== undefined) acInput.value = String(preset.acBonus);
    focusBox.input.checked = preset.spellFocus === true;
    if (preset.statusEffects) effects.set(preset.statusEffects);
    const [buff] = Object.entries(preset.statBonuses ?? {});
    if (buff) {
      buffStatSelect.value = buff[0];
      buffAmountInput.value = String(buff[1]);
      syncTypeFields();
    }
    nameInput.value = preset.name;
  });

  // The form lays out as fixed rows: name, description, then type with
  // quantity and preset on one line, then the type-specific rows. A field
  // that a type does not need hides alone inside its row, and a row hides
  // when everything in it does, so the shared controls never reflow around
  // appearing fields.
  const armorRow = fieldRow(weightField, baseACField);
  const weaponRow = fieldRow(categoryField, kindField, rangeNormalField, rangeLongField);
  const propertiesRow = fieldRow(propertiesField);
  const damageRow = fieldRow(damageField);
  const versatileRow = fieldRow(versatileField);
  const effectsRow = fieldRow(effectsField);
  // The flat AC bonus shares a row with the stat buff. Both are small
  // worn-item numbers, and each hides on its own when the type drops it.
  const acRow = fieldRow(acField, buffStatField, buffAmountField);
  const focusRow = fieldRow(focusField);

  // The range fields show only for a ranged or thrown weapon, and the
  // two-handed damage editor only with the versatile box. The whole-row
  // hiding stays with syncTypeFields.
  const syncWeaponFields = () => {
    const keys = checkedProperties().map((p) => p.key);
    const ranged = kindSelect.value === 'ranged' || keys.includes('thrown');
    rangeNormalField.hidden = rangeLongField.hidden = !ranged;
    versatileRow.hidden = versatileField.hidden =
      !WEAPON_TYPES.includes(typeSelect.value) || !keys.includes('versatile');
  };
  kindSelect.addEventListener('change', syncWeaponFields);
  for (const { box } of propertyBoxes) box.input.addEventListener('change', syncWeaponFields);

  const syncTypeFields = () => {
    const type = typeSelect.value;
    const weaponish = WEAPON_TYPES.includes(type);
    weightField.hidden = baseACField.hidden = type !== 'armor';
    syncShieldAC();
    acField.hidden = !FLAT_AC_TYPES.includes(type);
    buffStatField.hidden = !EQUIPPABLE_TYPES.includes(type);
    buffAmountField.hidden = buffStatField.hidden || buffStatSelect.value === '';
    categoryField.hidden = kindField.hidden = damageField.hidden = effectsField.hidden = !weaponish;
    propertiesField.hidden = !weaponish;
    armorRow.hidden = weightField.hidden;
    weaponRow.hidden = propertiesRow.hidden = damageRow.hidden = effectsRow.hidden = !weaponish;
    acRow.hidden = acField.hidden && buffStatField.hidden;
    syncWeaponFields();
    const presets = presetsFor(type);
    presetField.hidden = presets.length === 0;
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
      kind: kindSelect.value,
      category: categorySelect.value,
      properties: checkedProperties().map((p) => p.key),
      rangeNormal: rangeNormalInput.value,
      rangeLong: rangeLongInput.value,
      versatileDamage: versatileDamage.get(),
      damage: damage.get(),
      statusEffects: effects.get(),
      spellFocus: focusBox.input.checked,
    });

  return buildInlineForm({
    nameInput,
    rows: [
      descriptionInput,
      // A library template is a blueprint, not a stack. It has no quantity to set.
      template
        ? fieldRow(labeled('Type', typeSelect), presetField)
        : fieldRow(labeled('Type', typeSelect), labeled('Qty', quantityInput), presetField),
      armorRow,
      weaponRow,
      propertiesRow,
      damageRow,
      versatileRow,
      effectsRow,
      acRow,
      focusRow,
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
          focusBox.input.checked = false;
        },
  });
}
