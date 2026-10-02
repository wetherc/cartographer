import { ABILITY_SCORES } from './Modifiers.js';
import { isProficientArmor } from './Proficiencies.js';
import { isCaster } from './Caster.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/feat.js').Feat} Feat */
/** @typedef {import('../types/feat.js').FeatRequirement} FeatRequirement */

const ARMOR = ['light', 'medium', 'heavy', 'shield'];

/**
 * Whether the character meets a feat's structured requirement. Every part
 * that the requirement names has to hold: each minimum score, the armor
 * proficiency, and the ability to cast a spell. A missing score reads as the
 * neutral 10. A feat with no structured requirement is always open, and its
 * prerequisite text is the GM's to enforce.
 * @param {Character} character
 * @param {Feat} feat
 * @returns {boolean}
 */
export function meetsFeatRequirement(character, feat) {
  const req = feat.requires;
  if (!req) return true;
  const scores = Object.entries(req.abilities ?? {});
  if (scores.some(([key, min]) => (character.stats?.[key] ?? 10) < min)) return false;
  if (req.armor && !isProficientArmor(character, req.armor)) return false;
  return !req.spellcasting || isCaster(character);
}

/**
 * The options of the take-feat dialog's picker. A feat the character does
 * not qualify for stays listed, disabled, and names what it needs. The
 * disabled entries sort after the open ones, so the first option works
 * whenever any option does.
 * @param {Character} character
 * @param {Feat[]} feats
 * @returns {{ value: string, label: string, disabled?: boolean }[]}
 */
export function featOptions(character, feats) {
  const open = [];
  const closed = [];
  for (const feat of feats) {
    if (meetsFeatRequirement(character, feat)) {
      const label = feat.prerequisite ? `${feat.name} (${feat.prerequisite})` : feat.name;
      open.push({ value: feat.id, label });
    } else {
      // The text starts a sentence in the catalog, and here it follows "requires".
      const text = feat.prerequisite ?? 'a requirement this character lacks';
      const needs = text.charAt(0).toLowerCase() + text.slice(1);
      closed.push({ value: feat.id, label: `${feat.name}: requires ${needs}`, disabled: true });
    }
  }
  return [...open, ...closed];
}

/**
 * Repair a parsed requirement. Ability keys match without case and keep a
 * whole-number minimum from 1 to 30. An unknown armor weight drops. The
 * result is undefined when nothing valid is left, so the feat reads as open.
 * @param {unknown} raw
 * @returns {FeatRequirement | undefined}
 */
export function normalizeFeatRequirement(raw) {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = /** @type {Record<string, unknown>} */ (raw);
  /** @type {Record<string, number>} */
  const abilities = {};
  if (r.abilities && typeof r.abilities === 'object') {
    for (const [key, min] of Object.entries(r.abilities)) {
      const upper = key.toUpperCase();
      if (ABILITY_SCORES.includes(upper) && Number.isInteger(min) && min >= 1 && min <= 30) {
        abilities[upper] = /** @type {number} */ (min);
      }
    }
  }
  const armor = typeof r.armor === 'string' && ARMOR.includes(r.armor) ? r.armor : undefined;
  /** @type {FeatRequirement} */
  const req = {
    ...(Object.keys(abilities).length > 0 ? { abilities } : {}),
    ...(armor ? { armor: /** @type {FeatRequirement['armor']} */ (armor) } : {}),
    ...(r.spellcasting === true ? { spellcasting: true } : {}),
  };
  return Object.keys(req).length > 0 ? req : undefined;
}
