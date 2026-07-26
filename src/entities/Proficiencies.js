import { getClass } from './Classes.js';
import { resolveRace } from './Races.js';
import { resolveBackground } from './Backgrounds.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/entities.js').Proficiencies} Proficiencies */

/** @returns {Proficiencies} every proficiency list empty */
export function emptyProficiencies() {
  return { saves: [], skills: [], weapons: [], armor: [], tools: [], languages: [] };
}

/** Merge lists into one duplicate-free array, first occurrence's order kept.
 * @param {...string[]} lists
 * @returns {string[]} */
function merged(...lists) {
  return [...new Set(lists.flat())];
}

/**
 * A character's proficiency lists, or all-empty ones for a character that
 * predates them (so callers never guard against undefined).
 * @param {Character} character
 * @returns {Proficiencies}
 */
export function getProficiencies(character) {
  return character.proficiencies ?? emptyProficiencies();
}

/**
 * Assemble the proficiency lists a character's class, race, and background
 * grant. Fixed grants come straight from the definitions: the class gives
 * saving throws, armor, and weapons (categories plus named), the race gives
 * skills, weapons, tools, and languages, and the background gives skills and
 * tools. Choice-based grants — the class's skill picks and the background's
 * bonus languages — can't be derived, so the caller passes the player's picks
 * in `choices`. A missing class/race/background contributes nothing. Pure;
 * does not touch the character.
 * @param {Character} character
 * @param {{ skills?: string[], languages?: string[] }} [choices]
 * @returns {Proficiencies}
 */
export function assembleProficiencies(character, choices = {}) {
  const cls = getClass(character.class);
  const race = resolveRace(character);
  const background = resolveBackground(character);
  return {
    saves: merged(cls?.savingThrows ?? []),
    skills: merged(race?.skills ?? [], background?.skills ?? [], choices.skills ?? []),
    weapons: merged(cls?.weaponCategories ?? [], cls?.weaponNamed ?? [], race?.weapons ?? []),
    armor: merged(cls?.armor ?? []),
    tools: merged(race?.tools ?? [], background?.tools ?? []),
    languages: merged(race?.languages ?? [], choices.languages ?? []),
  };
}

/**
 * Set the character's proficiency lists (the hand-edit path, and how an
 * assembled set is applied). Each list is deduplicated; a missing list reads
 * as empty. Expertise entries whose skill is no longer proficient are pruned,
 * keeping the subset invariant. Pure.
 * @param {Character} character
 * @param {Partial<Proficiencies>} proficiencies
 * @returns {Character}
 */
export function withProficiencies(character, proficiencies) {
  const next = {
    saves: merged(proficiencies.saves ?? []),
    skills: merged(proficiencies.skills ?? []),
    weapons: merged(proficiencies.weapons ?? []),
    armor: merged(proficiencies.armor ?? []),
    tools: merged(proficiencies.tools ?? []),
    languages: merged(proficiencies.languages ?? []),
  };
  const expertise = (character.expertise ?? []).filter((id) => next.skills.includes(id));
  return { ...character, proficiencies: next, expertise };
}

/**
 * Set the character's expertise skills. Deduplicated, and filtered to skills
 * the character is proficient in — expertise doubles a proficiency, so it
 * can't exist without one. Pure.
 * @param {Character} character
 * @param {string[]} skillIds
 * @returns {Character}
 */
export function withExpertise(character, skillIds) {
  const skills = getProficiencies(character).skills;
  return { ...character, expertise: merged(skillIds).filter((id) => skills.includes(id)) };
}

/**
 * @param {Character} character
 * @param {string} ability
 * @returns {boolean} whether the character is proficient in this saving throw
 */
export function isProficientSave(character, ability) {
  return getProficiencies(character).saves.includes(ability);
}

/**
 * @param {Character} character
 * @param {string} skillId
 * @returns {boolean} whether the character is proficient in this skill
 */
export function isProficientSkill(character, skillId) {
  return getProficiencies(character).skills.includes(skillId);
}

/**
 * @param {Character} character
 * @param {string} skillId
 * @returns {boolean} whether the character has expertise in this skill
 */
export function hasExpertise(character, skillId) {
  return (character.expertise ?? []).includes(skillId);
}
