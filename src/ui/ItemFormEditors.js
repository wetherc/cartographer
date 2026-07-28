import { DIE_SIZES, DAMAGE_TYPES, normalizeDamagePart } from '../entities/Equipment.js';
import { iconButton, removableChip } from './buttons.js';
import { el } from './dom.js';
import { numberField, select, textField } from './formFields.js';
import { clampInt } from '../util/num.js';

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
  let damageParts = initial.map(normalizeDamagePart);
  const element = el('div', 'inventory-panel__damage');

  function render() {
    element.innerHTML = '';
    damageParts.forEach((part, index) => {
      const row = el('div', 'inventory-panel__damage-row');

      const countInput = numberField(part.count, {
        min: 1,
        className: 'inventory-panel__dice-count',
        ariaLabel: 'Number of dice',
      });
      countInput.addEventListener('change', () => {
        part.count = clampInt(countInput.value, 1);
        countInput.value = String(part.count);
      });

      const dieSelect = select(
        DIE_SIZES.map((sides) => ({ value: String(sides), label: `d${sides}` })),
        String(part.sides),
        { ariaLabel: 'Die size' },
      );
      dieSelect.addEventListener('change', () => {
        part.sides = Number(dieSelect.value);
      });

      const typeSelectEl = select([...DAMAGE_TYPES], part.damageType, {
        ariaLabel: 'Damage type',
      });
      typeSelectEl.addEventListener('change', () => {
        part.damageType = typeSelectEl.value;
      });

      row.append(countInput, dieSelect, typeSelectEl);

      // The first term is the weapon's base roll and always present; later
      // terms are removable riders.
      if (index > 0) {
        row.appendChild(
          iconButton('minus', 'Remove damage term', () => {
            damageParts.splice(index, 1);
            render();
          }),
        );
      }
      element.appendChild(row);
    });

    element.appendChild(
      iconButton(
        'plus',
        'Add damage term',
        () => {
          damageParts.push({ count: 1, sides: 4, damageType: 'fire' });
          render();
        },
        {
          className: 'inventory-panel__damage-add',
          title: 'Add a permanent extra damage term (e.g. + 1d4 fire)',
        },
      ),
    );
  }
  render();

  return {
    element,
    get: () => damageParts.map((p) => ({ ...p })),
    set: (parts) => {
      damageParts = parts.map(normalizeDamagePart);
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
  const element = el('div', 'inventory-panel__effect-editor');

  function render() {
    element.innerHTML = '';
    for (const effect of statusEffects) {
      element.appendChild(
        removableChip(effect, () => {
          statusEffects.splice(statusEffects.indexOf(effect), 1);
          render();
        }),
      );
    }
    const effectInput = textField('', 'e.g. burning', {
      className: 'inventory-panel__effect-input',
    });
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
    element.append(effectInput, iconButton('plus', 'Add status effect', addEffect));
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
