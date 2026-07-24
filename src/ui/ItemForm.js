import { ABILITY_SCORES } from '../entities/Character.js';
import {
  ITEM_TYPES,
  ARMOR_WEIGHTS,
  SHIELD_AC,
  WEAPON_TYPES,
  WEAPON_PRESETS,
  WEAPON_HANDLING,
  DIE_SIZES,
  DAMAGE_TYPES,
} from '../entities/Equipment.js';
import { icon } from './icons.js';

/** @typedef {import('../types/entities.js').InventoryItem} InventoryItem */
/** @typedef {import('../types/entities.js').ItemType} ItemType */
/** @typedef {import('../types/entities.js').DamagePart} DamagePart */

/** Item types that may carry a flat AC bonus while equipped. */
const FLAT_AC_TYPES = ['weapon', 'helmet', 'gloves', 'greaves', 'bow', 'ring'];

/** Item types that can be equipped somewhere, and so may buff a stat. */
const EQUIPPABLE_TYPES = ['weapon', 'armor', 'helmet', 'gloves', 'greaves', 'shield', 'bow', 'ring'];

/**
 * A small captioned wrapper so each control in the form names itself.
 * @param {string} caption
 * @param {HTMLElement} control
 * @returns {HTMLLabelElement}
 */
function labeled(caption, control) {
  const label = document.createElement('label');
  label.className = 'inventory-panel__field-label';
  const text = document.createElement('span');
  text.textContent = caption;
  label.append(text, control);
  return label;
}

/**
 * A horizontal grouping of related fields. Type-specific fields toggle in and
 * out per row, so appearing controls extend their own line instead of
 * reflowing the whole form.
 * @param {...HTMLElement} children
 * @returns {HTMLDivElement}
 */
function fieldRow(...children) {
  const row = document.createElement('div');
  row.className = 'inventory-panel__form-row';
  row.append(...children);
  return row;
}

/**
 * The item create/edit form, shared by the add row and the per-item editor.
 * Every mechanical field is here: type-specific armor/shield/AC/buff controls,
 * and for weapons and bows a 5e preset picker, handling (which fixes the
 * damage ability), a structured damage-dice editor (base roll plus permanent
 * riders like + 1d4 fire), and inflicted status effects. Submitting calls
 * `onSubmit` with the assembled fields (no id — the caller owns identity) and
 * clears the form only when adding (editing keeps the values on screen).
 * @param {{
 *   item?: InventoryItem | null,
 *   submitLabel: string,
 *   onSubmit: (fields: Omit<InventoryItem, 'id'>) => void,
 *   onCancel?: (() => void) | null,
 * }} options
 * @returns {HTMLElement}
 */
export function buildItemForm({ item = null, submitLabel, onSubmit, onCancel = null }) {
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
  typeSelect.value = item ? item.type ?? 'gear' : ITEM_TYPES[0];

  // Body armor: its 5e weight class (which alone fixes the DEX scaling —
  // never the GM's input) and a configurable base AC defaulting to a
  // representative value for the chosen weight.
  const weightSelect = document.createElement('select');
  weightSelect.className = 'field';
  for (const w of ARMOR_WEIGHTS) {
    const option = document.createElement('option');
    option.value = w.key;
    option.textContent =
      w.dexCap === 0 ? `${w.label} (no DEX)`
      : w.dexCap === Infinity ? `${w.label} (+ DEX)`
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

  // Weapon fields: a 5e preset to start from, the handling (melee uses STR,
  // finesse and ranged use DEX — never the GM's input), and the damage roll
  // as editable dice terms: the base roll first, then permanent riders.
  const presetSelect = document.createElement('select');
  presetSelect.className = 'field';
  const customOption = document.createElement('option');
  customOption.value = '';
  customOption.textContent = 'Custom';
  presetSelect.appendChild(customOption);
  const presetField = labeled('5e preset', presetSelect);

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

  /** @type {DamagePart[]} */
  let damageParts = (item?.damage ?? [{ count: 1, sides: 6, damageType: 'slashing' }]).map((p) => ({ ...p }));
  const damageEditor = document.createElement('div');
  damageEditor.className = 'inventory-panel__damage';
  const damageField = labeled('Damage', damageEditor);

  function renderDamage() {
    damageEditor.innerHTML = '';
    damageParts.forEach((part, index) => {
      const row = document.createElement('div');
      row.className = 'inventory-panel__damage-row';

      const countInput = document.createElement('input');
      countInput.type = 'number';
      countInput.min = '1';
      countInput.value = String(part.count);
      countInput.className = 'field inventory-panel__dice-count';
      countInput.setAttribute('aria-label', 'Number of dice');
      countInput.addEventListener('change', () => {
        part.count = Math.max(1, Math.floor(Number(countInput.value)) || 1);
        countInput.value = String(part.count);
      });

      const dieSelect = document.createElement('select');
      dieSelect.className = 'field';
      dieSelect.setAttribute('aria-label', 'Die size');
      for (const sides of DIE_SIZES) {
        const option = document.createElement('option');
        option.value = String(sides);
        option.textContent = `d${sides}`;
        dieSelect.appendChild(option);
      }
      dieSelect.value = String(part.sides);
      dieSelect.addEventListener('change', () => {
        part.sides = Number(dieSelect.value);
      });

      const typeSelectEl = document.createElement('select');
      typeSelectEl.className = 'field';
      typeSelectEl.setAttribute('aria-label', 'Damage type');
      for (const damageType of DAMAGE_TYPES) {
        const option = document.createElement('option');
        option.value = damageType;
        option.textContent = damageType;
        typeSelectEl.appendChild(option);
      }
      typeSelectEl.value = DAMAGE_TYPES.includes(part.damageType) ? part.damageType : DAMAGE_TYPES[0];
      typeSelectEl.addEventListener('change', () => {
        part.damageType = typeSelectEl.value;
      });

      row.append(countInput, dieSelect, typeSelectEl);

      // The first term is the weapon's base roll and always present; later
      // terms are removable riders.
      if (index > 0) {
        const removeRider = document.createElement('button');
        removeRider.type = 'button';
        removeRider.className = 'btn btn--icon';
        removeRider.setAttribute('aria-label', 'Remove damage term');
        removeRider.appendChild(icon('minus'));
        removeRider.addEventListener('click', () => {
          damageParts.splice(index, 1);
          renderDamage();
        });
        row.appendChild(removeRider);
      }
      damageEditor.appendChild(row);
    });

    const addRider = document.createElement('button');
    addRider.type = 'button';
    addRider.className = 'btn';
    addRider.textContent = '+ damage';
    addRider.title = 'Add a permanent extra damage term (e.g. + 1d4 fire)';
    addRider.addEventListener('click', () => {
      damageParts.push({ count: 1, sides: 4, damageType: 'fire' });
      renderDamage();
    });
    damageEditor.appendChild(addRider);
  }
  renderDamage();

  presetSelect.addEventListener('change', () => {
    const preset = WEAPON_PRESETS.find((p) => p.name === presetSelect.value);
    if (!preset) return;
    handlingSelect.value = preset.handling;
    damageParts = preset.damage.map((p) => ({ ...p }));
    renderDamage();
    if (!nameInput.value.trim()) nameInput.value = preset.name;
  });

  // Status effects the weapon inflicts, as removable chips plus an add row.
  /** @type {string[]} */
  const statusEffects = [...(item?.statusEffects ?? [])];
  const effectsEditor = document.createElement('div');
  effectsEditor.className = 'inventory-panel__effects';
  const effectsField = labeled('Inflicts', effectsEditor);

  function renderEffects() {
    effectsEditor.innerHTML = '';
    for (const effect of statusEffects) {
      const chip = document.createElement('span');
      chip.className = 'inventory-panel__chip';
      chip.textContent = effect;
      const removeChip = document.createElement('button');
      removeChip.type = 'button';
      removeChip.className = 'inventory-panel__chip-remove';
      removeChip.setAttribute('aria-label', `Remove ${effect}`);
      removeChip.textContent = '×';
      removeChip.addEventListener('click', () => {
        statusEffects.splice(statusEffects.indexOf(effect), 1);
        renderEffects();
      });
      chip.appendChild(removeChip);
      effectsEditor.appendChild(chip);
    }
    const effectInput = document.createElement('input');
    effectInput.type = 'text';
    effectInput.placeholder = 'e.g. burning';
    effectInput.className = 'field inventory-panel__effect-input';
    const addEffect = () => {
      const effect = effectInput.value.trim();
      if (!effect || statusEffects.includes(effect)) return;
      statusEffects.push(effect);
      renderEffects();
    };
    effectInput.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      addEffect();
    });
    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.className = 'btn btn--icon';
    addButton.setAttribute('aria-label', 'Add status effect');
    addButton.appendChild(icon('plus'));
    addButton.addEventListener('click', addEffect);
    effectsEditor.append(effectInput, addButton);
  }
  renderEffects();

  // The form lays out as fixed rows (name, description, type/qty, then the
  // type-specific rows) so toggling a type only shows or hides whole rows —
  // the shared controls never reflow around appearing fields.
  const armorRow = fieldRow(weightField, baseACField, shieldField);
  const weaponRow = fieldRow(presetField, handlingField);
  const damageRow = fieldRow(damageField);
  const effectsRow = fieldRow(effectsField);
  const bonusRow = fieldRow(acField, buffStatField, buffAmountField);

  const syncTypeFields = () => {
    const type = typeSelect.value;
    const weaponish = WEAPON_TYPES.includes(type);
    weightField.hidden = baseACField.hidden = type !== 'armor';
    shieldField.hidden = type !== 'shield';
    acField.hidden = !FLAT_AC_TYPES.includes(type);
    buffStatField.hidden = !EQUIPPABLE_TYPES.includes(type);
    buffAmountField.hidden = buffStatField.hidden || buffStatSelect.value === '';
    presetField.hidden = handlingField.hidden = damageField.hidden = effectsField.hidden = !weaponish;
    armorRow.hidden = weightField.hidden && shieldField.hidden;
    weaponRow.hidden = damageRow.hidden = effectsRow.hidden = !weaponish;
    bonusRow.hidden = acField.hidden && buffStatField.hidden;
    if (weaponish) {
      presetSelect.replaceChildren(
        customOption,
        ...WEAPON_PRESETS.filter((p) => p.type === type).map((p) => {
          const option = document.createElement('option');
          option.value = p.name;
          const base = p.damage[0];
          option.textContent = `${p.name} (${base.count}d${base.sides})`;
          return option;
        }),
      );
      presetSelect.value = '';
    }
  };
  typeSelect.addEventListener('change', syncTypeFields);
  buffStatSelect.addEventListener('change', syncTypeFields);
  syncTypeFields();

  const submitButton = document.createElement('button');
  submitButton.type = 'button';
  submitButton.className = 'btn btn--primary';
  submitButton.setAttribute('aria-label', submitLabel);
  submitButton.appendChild(icon(item ? 'check' : 'add'));
  submitButton.addEventListener('click', () => {
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
            armorWeight: /** @type {import('../types/entities.js').ArmorWeight} */ (weightSelect.value),
            baseAC: Math.max(1, Number(baseACInput.value) || 10),
          }
        : {}),
      ...(acBonus > 0 ? { acBonus } : {}),
      ...(buffStat && buffAmount !== 0 ? { statBonuses: { [buffStat]: buffAmount } } : {}),
      ...(WEAPON_TYPES.includes(type)
        ? {
            handling: /** @type {import('../types/entities.js').WeaponHandling} */ (handlingSelect.value),
            damage: damageParts.map((p) => ({ ...p })),
            ...(statusEffects.length ? { statusEffects: [...statusEffects] } : {}),
          }
        : {}),
    });
    if (!item) {
      nameInput.value = '';
      descriptionInput.value = '';
      quantityInput.value = '1';
    }
  });

  const actionsRow = fieldRow(submitButton);
  if (onCancel) {
    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'btn';
    cancelButton.textContent = 'Cancel';
    cancelButton.addEventListener('click', onCancel);
    actionsRow.appendChild(cancelButton);
  }

  form.append(
    nameInput,
    descriptionInput,
    fieldRow(labeled('Type', typeSelect), labeled('Qty', quantityInput)),
    armorRow,
    weaponRow,
    damageRow,
    effectsRow,
    bonusRow,
    actionsRow,
  );

  return form;
}
