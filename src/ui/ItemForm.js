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
import { labeled, fieldRow, formActions } from './formFields.js';

/** @typedef {import('../types/entities.js').InventoryItem} InventoryItem */
/** @typedef {import('../types/entities.js').ItemType} ItemType */
/** @typedef {import('../types/library.js').EquipmentTemplate} EquipmentTemplate */

/** Item types that may carry a flat AC bonus while equipped. */
const FLAT_AC_TYPES = ['weapon', 'helmet', 'gloves', 'greaves', 'bow', 'ring'];

/** Item types that can be equipped somewhere, and so may buff a stat. */
const EQUIPPABLE_TYPES = [
  'weapon',
  'armor',
  'helmet',
  'gloves',
  'greaves',
  'shield',
  'bow',
  'ring',
];

/**
 * The item create/edit form, shared by the add row and the per-item editor.
 * Every mechanical field is here: type-specific armor/shield/AC/buff controls,
 * and for weapons and bows a 5e preset picker, handling (which fixes the
 * damage ability), a structured damage-dice editor (base roll plus permanent
 * riders like + 1d4 fire), and inflicted status effects — the last two built
 * as widgets in ItemFormEditors.js. Submitting calls
 * `onSubmit` with the assembled fields (no id — the caller owns identity) and
 * clears the form only when adding (editing keeps the values on screen).
 * With `template` the form describes a reusable blueprint (the Library rail's
 * editor) rather than a stack in someone's pack, so the quantity field is
 * hidden and submits report quantity 1.
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
  const form = document.createElement('div');
  form.className = 'inventory-panel__form';

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.placeholder = 'Item name';
  nameInput.className = 'field inventory-panel__name-input';
  nameInput.value = item?.name ?? '';

  const descriptionInput = document.createElement('input');
  descriptionInput.type = 'text';
  descriptionInput.placeholder = 'Description (optional)';
  descriptionInput.className = 'field inventory-panel__name-input';
  descriptionInput.value = item?.description ?? '';

  const quantityInput = document.createElement('input');
  quantityInput.type = 'number';
  quantityInput.value = String(item?.quantity ?? 1);
  quantityInput.min = '1';
  quantityInput.className = 'field inventory-panel__quantity-input';

  const typeSelect = document.createElement('select');
  typeSelect.className = 'field inventory-panel__type-select';
  for (const t of ITEM_TYPES) {
    const option = document.createElement('option');
    option.value = t;
    // "gear" is the catch-all for miscellaneous, non-equippable items
    // (rope, rations, trinkets); say so where the GM picks it.
    option.textContent = t === 'gear' ? 'gear (misc.)' : t;
    typeSelect.appendChild(option);
  }
  typeSelect.value = item ? (item.type ?? 'gear') : ITEM_TYPES[0];

  // Body armor: its 5e weight class (which alone fixes the DEX scaling —
  // never the GM's input) and a configurable base AC defaulting to a
  // representative value for the chosen weight.
  const weightSelect = document.createElement('select');
  weightSelect.className = 'field';
  for (const w of ARMOR_WEIGHTS) {
    const option = document.createElement('option');
    option.value = w.key;
    option.textContent =
      w.dexCap === 0
        ? `${w.label} (no DEX)`
        : w.dexCap === Infinity
          ? `${w.label} (+ DEX)`
          : `${w.label} (+ DEX, max ${w.dexCap})`;
    weightSelect.appendChild(option);
  }
  weightSelect.value = item?.armorWeight ?? ARMOR_WEIGHTS[0].key;
  const baseACInput = document.createElement('input');
  baseACInput.type = 'number';
  baseACInput.value = String(item?.baseAC ?? ARMOR_WEIGHTS[0].defaultBaseAC);
  baseACInput.min = '1';
  baseACInput.className = 'field inventory-panel__ac-input';
  weightSelect.addEventListener('change', () => {
    const weight = ARMOR_WEIGHTS.find((w) => w.key === weightSelect.value);
    if (weight) baseACInput.value = String(weight.defaultBaseAC);
  });
  const weightField = labeled('Weight', weightSelect);
  const baseACField = labeled('Base AC', baseACInput);

  // Shields are always +2 AC (5e), so no input — just say so.
  const shieldNote = document.createElement('span');
  shieldNote.className = 'inventory-panel__note';
  shieldNote.textContent = `+${SHIELD_AC} AC`;
  const shieldField = labeled('Shield', shieldNote);

  // Non-armor equippables (helmets, rings, bows...) may carry a flat AC
  // bonus while equipped.
  const acInput = document.createElement('input');
  acInput.type = 'number';
  acInput.value = String(item?.acBonus ?? 0);
  acInput.min = '0';
  acInput.className = 'field inventory-panel__ac-input';
  acInput.title = 'Flat AC bonus while equipped';
  const acField = labeled('AC bonus', acInput);

  // Any equippable may buff an ability score while worn (e.g. +2 STR).
  const buffStatSelect = document.createElement('select');
  buffStatSelect.className = 'field';
  const noBuff = document.createElement('option');
  noBuff.value = '';
  noBuff.textContent = '—';
  buffStatSelect.appendChild(noBuff);
  for (const stat of ABILITY_SCORES) {
    const option = document.createElement('option');
    option.value = stat;
    option.textContent = stat;
    buffStatSelect.appendChild(option);
  }
  const buffAmountInput = document.createElement('input');
  buffAmountInput.type = 'number';
  buffAmountInput.value = '1';
  buffAmountInput.className = 'field inventory-panel__ac-input';
  const [firstBuff] = Object.entries(item?.statBonuses ?? {});
  if (firstBuff) {
    buffStatSelect.value = firstBuff[0];
    buffAmountInput.value = String(firstBuff[1]);
  }
  const buffStatField = labeled('Buff', buffStatSelect);
  const buffAmountField = labeled('Amount', buffAmountInput);

  // A library preset to start from — the 5e defaults merged with the GM's
  // Library-tab overrides and custom entries — offered for every type with at
  // least one entry: picking one fills the type's mechanical fields — and the
  // name and description when still blank — all of which stay editable after.
  const presetSelect = document.createElement('select');
  presetSelect.className = 'field';
  const customOption = document.createElement('option');
  customOption.value = '';
  customOption.textContent = 'Custom';
  presetSelect.appendChild(customOption);
  const presetField = labeled('Preset', presetSelect);

  /** The merged library entries backing a type's picker; empty hides the picker.
   * @param {string} type
   * @returns {EquipmentTemplate[]} */
  const presetsFor = (type) => activeEquipment(/** @type {ItemType} */ (type));

  const handlingSelect = document.createElement('select');
  handlingSelect.className = 'field';
  for (const h of WEAPON_HANDLING) {
    const option = document.createElement('option');
    option.value = h.key;
    option.textContent = `${h.label} (${h.ability})`;
    handlingSelect.appendChild(option);
  }
  handlingSelect.value = item?.handling ?? 'melee';
  const handlingField = labeled('Handling', handlingSelect);

  const damage = buildDamageEditor(
    item?.damage ?? [{ count: 1, sides: 6, damageType: 'slashing' }],
  );
  const damageField = labeled('Damage', damage.element);

  // Status effects the weapon inflicts, as removable chips plus an add row.
  const effects = buildEffectsEditor(item?.statusEffects ?? []);
  const effectsField = labeled('Inflicts', effects.element);

  presetSelect.addEventListener('change', () => {
    const type = typeSelect.value;
    const preset = presetsFor(type).find((p) => p.name === presetSelect.value);
    if (!preset) return;
    // Fill whichever mechanical fields the template carries; custom library
    // entries may also bring an AC bonus, a stat buff, or inflicted effects.
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
    if (!nameInput.value.trim()) nameInput.value = preset.name;
  });

  // The form lays out as fixed rows (name, description, type/qty, then the
  // type-specific rows) so toggling a type only shows or hides whole rows —
  // the shared controls never reflow around appearing fields.
  const presetRow = fieldRow(presetField);
  const armorRow = fieldRow(weightField, baseACField, shieldField);
  const weaponRow = fieldRow(handlingField);
  const damageRow = fieldRow(damageField);
  const effectsRow = fieldRow(effectsField);
  // AC bonus is its own row; the stat buff pairs its select with its amount.
  // Keeping them apart avoids a number input and a select sharing a row with
  // mismatched heights, which misaligned their captions.
  const acRow = fieldRow(acField);
  const buffRow = fieldRow(buffStatField, buffAmountField);

  /** One picker option's label, from whichever fields the preset carries.
   * @param {EquipmentTemplate} preset */
  const presetLabel = (preset) => {
    const base = preset.damage?.[0];
    if (base) return `${preset.name} (${base.count}d${base.sides})`;
    if (preset.baseAC !== undefined)
      return `${preset.name} (AC ${preset.baseAC}, ${preset.armorWeight ?? 'light'})`;
    return preset.name;
  };

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
      presetSelect.replaceChildren(
        customOption,
        ...presets.map((p) => {
          const option = document.createElement('option');
          option.value = p.name;
          option.textContent = presetLabel(p);
          return option;
        }),
      );
      presetSelect.value = '';
    }
  };
  typeSelect.addEventListener('change', syncTypeFields);
  buffStatSelect.addEventListener('change', syncTypeFields);
  syncTypeFields();

  const submit = () => {
    const name = nameInput.value.trim();
    const quantity = Number(quantityInput.value);
    if (!name || quantity <= 0) return;
    const type = /** @type {ItemType} */ (typeSelect.value);
    const description = descriptionInput.value.trim();
    const acBonus = FLAT_AC_TYPES.includes(type) ? Math.max(0, Number(acInput.value) || 0) : 0;
    const buffStat = EQUIPPABLE_TYPES.includes(type) ? buffStatSelect.value : '';
    const buffAmount = Number(buffAmountInput.value) || 0;
    onSubmit({
      name,
      quantity,
      notes: item?.notes ?? '',
      type,
      ...(description ? { description } : {}),
      ...(type === 'armor'
        ? {
            armorWeight: /** @type {import('../types/entities.js').ArmorWeight} */ (
              weightSelect.value
            ),
            baseAC: Math.max(1, Number(baseACInput.value) || 10),
          }
        : {}),
      ...(acBonus > 0 ? { acBonus } : {}),
      ...(buffStat && buffAmount !== 0 ? { statBonuses: { [buffStat]: buffAmount } } : {}),
      ...(WEAPON_TYPES.includes(type)
        ? {
            handling: /** @type {import('../types/entities.js').WeaponHandling} */ (
              handlingSelect.value
            ),
            damage: damage.get(),
            ...(effects.get().length ? { statusEffects: effects.get() } : {}),
          }
        : {}),
    });
    if (!item) {
      nameInput.value = '';
      descriptionInput.value = '';
      quantityInput.value = '1';
    }
  };

  const actionsRow = formActions({ submitLabel, onSubmit: submit, onCancel });

  form.append(
    nameInput,
    descriptionInput,
    // A library template is a blueprint, not a stack — no quantity to set.
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
    actionsRow,
  );

  return form;
}
