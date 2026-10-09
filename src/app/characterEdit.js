import {
  getHP,
  setMaxHP,
  clearMaxHPOverride,
  setBonusHP,
  setBaseAC,
} from '../entities/Character.js';
import { classMaxHP } from '../entities/HitDice.js';
import { derive, withProficiencies } from '../entities/Progression.js';
import {
  getProficiencies,
  normalizeProficiencies,
  ARMOR_PROFICIENCIES,
  WEAPON_CATEGORIES,
} from '../entities/Proficiencies.js';
import { ABILITY_SCORES } from '../entities/Modifiers.js';
import { SKILL_IDS, skillName } from '../data/skills.js';
import { clampInt } from '../util/num.js';
import { capitalize, splitList, splitTrimmedList } from '../util/text.js';
import { statFields } from './statFields.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/modal.js').ModalField} ModalField */

/**
 * This module defines the fields of a character's edit dialog and the pure
 * functions that apply the submitted values: the name, the ability scores,
 * the proficiency lists, the HP, and the AC. `rosterActions.js` supplies
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

/** The highest ability score a typed edit accepts, the 5e ceiling. */
const SCORE_MAX = 30;

/**
 * The name, ability score, and proficiency fields of the edit dialog. The
 * scores are the stored ones, with the race increases and ability score
 * improvements already in them and without the bonus of worn items. The
 * proficiency lists are the full lists, so a GM can add a downtime tool or
 * remove a pick made by mistake. Expertise has no field here. It stays on
 * the sheet, and a skill removed here drops its expertise too.
 * @param {Character} character
 * @returns {ModalField[]}
 */
export function basicsFields(character) {
  const prof = getProficiencies(character);
  return [
    { name: 'name', label: 'Name (required)', value: character.name, section: 'Character' },
    ...statFields(ABILITY_SCORES, character.stats).map((field) => ({
      ...field,
      max: SCORE_MAX,
    })),
    {
      name: 'saves',
      label: 'Saving throws',
      type: 'multiselect',
      value: prof.saves.join(','),
      options: ABILITY_SCORES.map((key) => ({ value: key, label: key })),
      columns: true,
      full: true,
      section: 'Proficiencies',
    },
    {
      name: 'skills',
      label: 'Skills',
      type: 'multiselect',
      value: prof.skills.join(','),
      options: SKILL_IDS.map((id) => ({ value: id, label: skillName(id) })),
      columns: true,
      full: true,
    },
    {
      name: 'armor',
      label: 'Armor',
      type: 'multiselect',
      value: prof.armor.join(','),
      options: ARMOR_PROFICIENCIES.map((key) => ({ value: key, label: capitalize(key) })),
      columns: true,
    },
    {
      name: 'weaponCategories',
      label: 'Weapon categories',
      type: 'multiselect',
      value: prof.weapons.categories.join(','),
      options: WEAPON_CATEGORIES.map((key) => ({ value: key, label: capitalize(key) })),
      columns: true,
    },
    {
      name: 'weapons',
      label: 'Other weapons (hit Enter to add)',
      type: 'tags',
      value: prof.weapons.named.join(','),
      full: true,
    },
    {
      name: 'tools',
      label: 'Tools (hit Enter to add)',
      type: 'tags',
      value: prof.tools.join(','),
      full: true,
    },
    {
      name: 'languages',
      label: 'Languages (hit Enter to add)',
      type: 'tags',
      value: prof.languages.join(','),
      full: true,
    },
  ];
}

/**
 * Apply the submitted name, scores, and proficiency lists to the character
 * as it is now. A blank name keeps the old one. A blank or invalid score
 * keeps the old score, and a score stops at 1 and 30. Changed scores and
 * changed lists both run `Progression.derive`, so a CON edit moves max HP
 * and a new skill counts toward its checks at once. Unchanged values return
 * the character unchanged. A field missing from `values` leaves its part
 * alone. The function is pure.
 * @param {Character} character
 * @param {Record<string, string>} values
 * @returns {Character}
 */
export function applyBasics(character, values) {
  let next = character;
  const name = (values.name ?? '').trim();
  if (name && name !== character.name) next = { ...next, name };

  const stats = { ...character.stats };
  let statsChanged = false;
  for (const key of ABILITY_SCORES) {
    const raw = values[`stat-${key}`];
    if (raw === undefined) continue;
    const current = character.stats[key] ?? 10;
    const score = clampInt(raw, 1, SCORE_MAX, current);
    if (score !== current) {
      stats[key] = score;
      statsChanged = true;
    }
  }
  if (statsChanged) next = derive({ ...next, stats });

  if (values.skills === undefined) return next;
  const before = getProficiencies(character);
  const lists = normalizeProficiencies({
    saves: splitList(values.saves),
    skills: splitList(values.skills),
    expertise: before.expertise,
    weapons: {
      categories: /** @type {import('../types/entities.js').WeaponCategory[]} */ (
        splitList(values.weaponCategories)
      ),
      named: splitTrimmedList(values.weapons),
    },
    armor: splitList(values.armor),
    tools: splitTrimmedList(values.tools),
    languages: splitTrimmedList(values.languages),
  });
  const same = JSON.stringify(lists) === JSON.stringify(normalizeProficiencies(before));
  return same ? next : withProficiencies(next, lists);
}
