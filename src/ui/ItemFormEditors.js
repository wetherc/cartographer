import { DIE_SIZES, DAMAGE_TYPES } from '../entities/Equipment.js';
import { icon } from './icons.js';

/** @typedef {import('../types/entities.js').DamagePart} DamagePart */

/**
 * The item form's two list editors — the structured damage-dice editor and
 * the inflicted-status-effects chips — split out of ItemForm.js, which keeps
 * the form layout and submit logic. Each is a self-contained widget: it owns
 * its working copy of the data and hands the form `element` to mount, `get`
 * to read the current value at submit, and `set` for the preset picker to
 * overwrite it.
 */

/**
 * The structured damage editor: one row per damage term (dice count, die
 * size, damage type). The first term is the weapon's base roll and always
 * present; later terms are removable riders added with the "+ damage" button.
 * @param {DamagePart[]} initial
 * @returns {{ element: HTMLElement, get: () => DamagePart[], set: (parts: DamagePart[]) => void }}
 */
export function buildDamageEditor(initial) {
  /** @type {DamagePart[]} */
  let damageParts = initial.map((p) => ({ ...p }));
  const element = document.createElement('div');
  element.className = 'inventory-panel__damage';

  function render() {
    element.innerHTML = '';
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
      typeSelectEl.value = DAMAGE_TYPES.includes(part.damageType)
        ? part.damageType
        : DAMAGE_TYPES[0];
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
          render();
        });
        row.appendChild(removeRider);
      }
      element.appendChild(row);
    });

    const addRider = document.createElement('button');
    addRider.type = 'button';
    addRider.className = 'btn btn--icon inventory-panel__damage-add';
    addRider.setAttribute('aria-label', 'Add damage term');
    addRider.appendChild(icon('plus'));
    addRider.title = 'Add a permanent extra damage term (e.g. + 1d4 fire)';
    addRider.addEventListener('click', () => {
      damageParts.push({ count: 1, sides: 4, damageType: 'fire' });
      render();
    });
    element.appendChild(addRider);
  }
  render();

  return {
    element,
    get: () => damageParts.map((p) => ({ ...p })),
    set: (parts) => {
      damageParts = parts.map((p) => ({ ...p }));
      render();
    },
  };
}

/**
 * Status effects the weapon inflicts, as removable chips plus an add row
 * (text input, Enter or the plus button to add).
 * @param {string[]} initial
 * @returns {{ element: HTMLElement, get: () => string[], set: (effects: string[]) => void }}
 */
export function buildEffectsEditor(initial) {
  /** @type {string[]} */
  const statusEffects = [...initial];
  const element = document.createElement('div');
  element.className = 'inventory-panel__effects';

  function render() {
    element.innerHTML = '';
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
        render();
      });
      chip.appendChild(removeChip);
      element.appendChild(chip);
    }
    const effectInput = document.createElement('input');
    effectInput.type = 'text';
    effectInput.placeholder = 'e.g. burning';
    effectInput.className = 'field inventory-panel__effect-input';
    const addEffect = () => {
      const effect = effectInput.value.trim();
      if (!effect || statusEffects.includes(effect)) return;
      statusEffects.push(effect);
      render();
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
    element.append(effectInput, addButton);
  }
  render();

  return {
    element,
    get: () => [...statusEffects],
    set: (effects) => {
      statusEffects.length = 0;
      statusEffects.push(...effects);
      render();
    },
  };
}
