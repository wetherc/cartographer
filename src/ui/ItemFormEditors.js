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

      // A term with a flat bonus may roll no dice, so the count's floor follows
      // the bonus rather than sitting at 1. Keeping the two in step here is what
      // stops the editor handing back a term the normalizer would rewrite.
      const countInput = numberField(part.count, {
        className: 'inventory-panel__dice-count',
        ariaLabel: 'Number of dice',
      });
      const countFloor = () => ((part.bonus ?? 0) === 0 ? 1 : 0);
      const syncCount = () => {
        const floor = countFloor();
        countInput.min = String(floor);
        part.count = clampInt(countInput.value, floor, Infinity, floor);
        countInput.value = String(part.count);
      };
      syncCount();
      countInput.addEventListener('change', syncCount);

      const dieSelect = select(
        DIE_SIZES.map((sides) => ({ value: String(sides), label: `d${sides}` })),
        String(part.sides),
        { ariaLabel: 'Die size' },
      );
      dieSelect.addEventListener('change', () => {
        part.sides = Number(dieSelect.value);
      });

      // The flat amount riding this term's dice, e.g. Magic Missile's 1d4+1. It
      // is not doubled on a critical hit, which is where it differs from adding
      // another die.
      const bonusInput = numberField(part.bonus ?? 0, {
        className: 'inventory-panel__dice-count',
        ariaLabel: 'Flat bonus',
      });
      bonusInput.title = 'A flat amount added to this term, e.g. the +1 of 1d4+1';
      bonusInput.addEventListener('change', () => {
        const bonus = clampInt(bonusInput.value, -Infinity, Infinity, 0);
        if (bonus === 0) delete part.bonus;
        else part.bonus = bonus;
        bonusInput.value = String(bonus);
        syncCount();
      });

      const typeSelectEl = select([...DAMAGE_TYPES], part.damageType, {
        ariaLabel: 'Damage type',
      });
      typeSelectEl.addEventListener('change', () => {
        part.damageType = typeSelectEl.value;
      });

      row.append(
        countInput,
        dieSelect,
        el('span', 'inventory-panel__damage-plus', '+'),
        bonusInput,
        typeSelectEl,
      );

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
