import { DIE_SIZES, DAMAGE_TYPES, normalizeDamagePart } from '../entities/Equipment.js';
import { iconButton, removableChip, textButton } from './buttons.js';
import { el } from './dom.js';
import { numberField, select, textField } from './formFields.js';
import { clampInt } from '../util/num.js';

/** @typedef {import('../types/entities.js').DamagePart} DamagePart */

/**
 * This module builds the item form's two list editors: the structured
 * damage-dice editor and the inflicted-status-effects chips. It is split
 * out of ItemForm.js, which keeps the form layout and submit logic. Each
 * editor is a self-contained widget. It owns its working copy of the
 * data, and hands the form `element` to mount, `get` to read the current
 * value at submit, and `set` for the preset picker to overwrite it.
 */

/**
 * The structured damage editor: one row per damage term, with dice count,
 * die size, flat bonus, and damage type. The first term is the weapon's
 * base roll and is always present. Later terms are removable riders added
 * with the "+ damage" button.
 *
 * `fixType` pins every term to one type and drops the type picker.
 * Restorative dice want this: healing has exactly one flavor. Offering
 * the 13 damage types there only lets a GM author a heal spell that
 * says "fire".
 * @param {DamagePart[]} initial
 * @param {string | null} [fixType]
 * @returns {{
 *   element: HTMLElement,
 *   get: () => DamagePart[],
 *   set: (parts: DamagePart[]) => void,
 *   setFixedType: (type: string | null) => void,
 * }}
 */
export function buildDamageEditor(initial, fixType = null) {
  let fixed = fixType;
  const types = () => (fixed ? [fixed] : DAMAGE_TYPES);
  /** @type {DamagePart[]} */
  let damageParts = initial.map((p) => normalizeDamagePart(p, types()));
  const element = el('div', 'u-col u-g1');

  function render() {
    element.innerHTML = '';
    damageParts.forEach((part, index) => {
      const row = el('div', 'u-row u-g1');

      // A term with a flat bonus can roll no dice, so the count's floor
      // follows the bonus, instead of sitting at 1. This keeps the editor
      // from handing back a term the normalizer rewrites.
      const countInput = numberField(part.count, {
        className: 'item-form__dice-count',
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

      // This is the flat amount riding this term's dice, for example
      // Magic Missile's 1d4+1. It is not doubled on a critical hit, which
      // is where it differs from adding another die.
      const bonusInput = numberField(part.bonus ?? 0, {
        className: 'item-form__dice-count',
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

      row.append(countInput, dieSelect, el('span', 'item-form__damage-plus', '+'), bonusInput);

      // With one type, there is nothing to pick, so the row names it in text.
      if (fixed) {
        part.damageType = fixed;
        row.appendChild(el('span', 'item-form__damage-type', fixed));
      } else {
        const typeSelectEl = select([...DAMAGE_TYPES], part.damageType, {
          ariaLabel: 'Damage type',
        });
        typeSelectEl.addEventListener('change', () => {
          part.damageType = typeSelectEl.value;
        });
        row.appendChild(typeSelectEl);
      }

      // The first term is the weapon's base roll and is always present.
      // Later terms are removable riders.
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

    // A visible label, not a bare plus: the button sits on its own line
    // under the terms, so an icon alone does not say what it adds.
    element.appendChild(
      textButton(
        'Add damage term',
        () => {
          damageParts.push({ count: 1, sides: 4, damageType: fixed ?? 'fire' });
          render();
        },
        {
          icon: 'plus',
          className: 'item-form__damage-add',
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
      damageParts = parts.map((p) => normalizeDamagePart(p, types()));
      render();
    },
    setFixedType: (type) => {
      if (fixed === type) return;
      fixed = type;
      // A term carrying a type the new vocabulary does not allow gets
      // re-typed. This stops a switch from damage to healing from
      // leaving "fire" dice behind.
      damageParts = damageParts.map((p) => normalizeDamagePart(p, types()));
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
  const element = el('div', 'u-row u-wrap u-g1');

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
    const effectInput = textField('', {
      placeholder: 'e.g. burning',
      className: 'item-form__effect-input',
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
