import {
  getHP,
  setMaxHP,
  clearMaxHPOverride,
  setBonusHP,
  setBaseAC,
} from '../entities/Character.js';
import { classMaxHP } from '../entities/HitDice.js';
import { clampInt } from '../util/num.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/modal.js').ModalField} ModalField */

/**
 * This module defines the fields of a character's edit dialog and the pure
 * function that applies the submitted values. `rosterActions.js` supplies
 * the modal around them. Both halves are free of DOM code, so the rules are
 * unit-testable.
 */

/**
 * The maximum HP the GM sees and types: the pool's maximum without the raise
 * that a chip adds (Aid's `hpBoost`). The chip ends on its own, so the typed
 * value has to leave it out, or the raise would stay after the chip ends.
 * @param {Character} character
 * @returns {number | null} null for a character with no HP pool
 */
export function baseMaxHP(character) {
  const hp = getHP(character);
  return hp ? hp.max - (character.hpBoost ?? 0) : null;
}

/**
 * The HP and AC fields of the edit dialog. A character with no HP pool gets
 * the AC field alone, because there is no maximum to set. A character whose
 * maximum the GM typed by hand also gets "Use class HP", which hands the
 * maximum back to the class rule. A classless character has no class rule,
 * so it does not get that box.
 * @param {Character} character
 * @returns {ModalField[]}
 */
export function vitalsFields(character) {
  const base = baseMaxHP(character);
  /** @type {ModalField[]} */
  const fields = [];
  if (base !== null) {
    fields.push({ name: 'maxHP', label: 'Max HP', type: 'number', value: base, min: 1 });
    const derived = character.hpOverride ? classMaxHP(character) : null;
    if (derived !== null) {
      fields.push({
        name: 'useClassHP',
        label: `Use class HP (${derived})`,
        type: 'checkbox',
        value: false,
      });
    }
    fields.push({
      name: 'bonusHP',
      label: 'Bonus HP (temporary)',
      type: 'number',
      value: character.bonusHP ?? 0,
      min: 0,
    });
  }
  fields.push({
    name: 'baseAC',
    label: 'Unarmored base AC',
    type: 'number',
    value: character.baseAC ?? 10,
    min: 1,
  });
  return fields;
}

/**
 * Apply the submitted HP and AC values to the character as it is now. A
 * typed maximum that equals the one the dialog showed leaves the class
 * rule in charge, so a GM who opens the dialog only to set the AC does not
 * pin the maximum. A different value sets the hand-typed maximum, with any
 * chip raise kept on top. "Use class HP" clears the hand-typed maximum and
 * wins over a typed value. Bonus HP changes only when the typed amount differs,
 * so an unchanged amount still ends with the spell that granted it. The
 * function is pure.
 * @param {Character} character
 * @param {Record<string, string>} values
 * @param {number | null} [shownMax] the maximum the dialog opened with, so a
 *   level gained in another tab while the dialog was open does not read as
 *   a typed change
 * @returns {Character}
 */
export function applyVitals(character, values, shownMax = baseMaxHP(character)) {
  let next = character;
  const base = baseMaxHP(character);
  if (base !== null && values.maxHP !== undefined) {
    if (values.useClassHP === '1') {
      next = clearMaxHPOverride(next);
    } else {
      const shown = shownMax ?? base;
      const typed = clampInt(values.maxHP, 1, Infinity, shown);
      if (typed !== shown) next = setMaxHP(next, typed + (character.hpBoost ?? 0));
    }
    const bonus = clampInt(values.bonusHP, 0);
    if (bonus !== (character.bonusHP ?? 0)) next = setBonusHP(next, bonus);
  }
  // Base AC applies only while no body armor is worn. The sheet's AC badge
  // shows the derived result either way.
  return setBaseAC(next, clampInt(values.baseAC, 10));
}
