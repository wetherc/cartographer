import { getClass } from './Classes.js';
import { primaryClass } from './Multiclass.js';
import { resolveRace } from './Races.js';
import { resolveBackground } from './Backgrounds.js';
import { ABILITY_SCORES } from './Modifiers.js';
import { SKILL_IDS } from '../data/skills.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/entities.js').Proficiencies} Proficiencies */
/** @typedef {import('../types/entities.js').LegacyProficiencies} LegacyProficiencies */
/** @typedef {import('../types/entities.js').WeaponProficiencies} WeaponProficiencies */
/** @typedef {import('../types/class.js').WeaponCategory} WeaponCategory */

/** The whole-category weapon proficiencies, as opposed to individually named
 * weapons. A character proficient with a category is proficient with every
 * weapon in it.
 * @type {WeaponCategory[]} */
export const WEAPON_CATEGORIES = ['simple', 'martial'];

/** Every entry the armor proficiency list can hold: the three weight classes
 * plus the shield, which is its own entry.
 * @type {import('../types/class.js').ArmorProficiency[]} */
export const ARMOR_PROFICIENCIES = ['light', 'medium', 'heavy', 'shield'];

/** @returns {Proficiencies} every proficiency list empty */
export function emptyProficiencies() {
  return {
    saves: [],
    skills: [],
    expertise: [],
    weapons: { categories: [], named: [] },
    armor: [],
    tools: [],
    languages: [],
  };
}

/** Merge lists into one duplicate-free array, keeping first occurrence's order.
 * @param {...string[]} lists
 * @returns {string[]} */
function merged(...lists) {
  return [...new Set(lists.flat())];
}

/**
 * Normalize a weapon-proficiency value, accepting either shape: the split
 * `{ categories, named }` shape, or the flat list that saves used before the
 * split, in which the category words sat among the weapon names. The
 * function deduplicates entries, and an entry that is not a known category
 * lands in `named`.
 * @param {WeaponProficiencies | string[] | undefined} weapons
 * @returns {WeaponProficiencies}
 */
export function normalizeWeaponProficiencies(weapons) {
  if (Array.isArray(weapons)) {
    const flat = merged(weapons);
    return {
      categories: /** @type {WeaponCategory[]} */ (
        flat.filter((w) => WEAPON_CATEGORIES.includes(/** @type {WeaponCategory} */ (w)))
      ),
      named: flat.filter((w) => !WEAPON_CATEGORIES.includes(/** @type {WeaponCategory} */ (w))),
    };
  }
  return {
    categories: /** @type {WeaponCategory[]} */ (merged(weapons?.categories ?? [])),
    named: merged(weapons?.named ?? []),
  };
}

/**
 * Clean a written proficiency set: every list deduplicated, the weapon lists
 * sorted into their two namespaces, and expertise cut down to the skills the
 * set actually grants. Expertise doubles a proficiency, so it cannot exist
 * without one, and this is the only place that invariant is enforced. Every
 * writer goes through here, so no caller has to prune by hand. A missing list
 * reads as empty. This function is pure.
 * @param {Partial<Proficiencies> & { weapons?: WeaponProficiencies | string[] }} [proficiencies]
 * @returns {Proficiencies}
 */
export function normalizeProficiencies(proficiencies) {
  const skills = merged(proficiencies?.skills ?? []);
  return {
    saves: merged(proficiencies?.saves ?? []),
    skills,
    expertise: merged(proficiencies?.expertise ?? []).filter((id) => skills.includes(id)),
    weapons: normalizeWeaponProficiencies(proficiencies?.weapons),
    armor: merged(proficiencies?.armor ?? []),
    tools: merged(proficiencies?.tools ?? []),
    languages: merged(proficiencies?.languages ?? []),
  };
}

/**
 * Clean the slim proficiency set a creature carries: the saving throws it is
 * trained in and the skills it is trained in. A creature records none of the
 * other training a character does, and it has no expertise, so this set is two
 * lists and not the seven of `normalizeProficiencies`. Each list is
 * deduplicated, and an entry that names no ability or no skill is dropped, so
 * a hand-edited save or a library file cannot put a bonus on something the
 * rest of the app cannot roll. This function is pure.
 * @param {unknown} value
 * @returns {import('../types/creature.js').CreatureProficiencies}
 */
export function normalizeCreatureProficiencies(value) {
  const source = /** @type {{ saves?: unknown, skills?: unknown }} */ (
    value && typeof value === 'object' ? value : {}
  );
  const list = (/** @type {unknown} */ raw) => (Array.isArray(raw) ? merged(raw) : []);
  return {
    saves: list(source.saves).filter((ability) => ABILITY_SCORES.includes(ability)),
    skills: list(source.skills).filter((id) => SKILL_IDS.includes(id)),
  };
}

/**
 * The proficiency field to spread into a creature or a template, or nothing at
 * all. A creature trained in nothing carries no field, so the common case
 * stores nothing and an absent field keeps meaning "trained in nothing".
 * @param {unknown} value
 * @returns {{ proficiencies?: import('../types/creature.js').CreatureProficiencies }}
 */
export function creatureProficiencyFields(value) {
  const proficiencies = normalizeCreatureProficiencies(value);
  const empty = proficiencies.saves.length === 0 && proficiencies.skills.length === 0;
  return empty ? {} : { proficiencies };
}

/**
 * Whether the character can use a weapon without penalty: either its whole
 * category is granted or the weapon is named individually. Names are compared
 * case-insensitively, since a named grant is stored lowercase while an item's
 * name is however the GM typed it.
 * @param {Character} character
 * @param {string} name the weapon's name
 * @param {WeaponCategory} [category] the weapon's category, when known
 * @returns {boolean}
 */
export function isProficientWeapon(character, name, category) {
  const weapons = getProficiencies(character).weapons;
  if (category && weapons.categories.includes(category)) return true;
  return weapons.named.includes(name.trim().toLowerCase());
}

/**
 * Whether the character can wear armor of this weight class without penalty.
 * A shield is its own entry in the armor list, so it goes through the same
 * check.
 * @param {Character} character
 * @param {import('../types/class.js').ArmorProficiency} weight
 * @returns {boolean}
 */
export function isProficientArmor(character, weight) {
  return getProficiencies(character).armor.includes(weight);
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
 * Assemble the proficiency lists that a character's class, race, and
 * background grant. Fixed grants come straight from the definitions. The
 * class gives saving throws, armor, and weapons (categories plus named).
 * The race gives skills, weapons, tools, and languages. The background
 * gives skills and tools. The function cannot derive choice-based grants
 * (the class's skill picks and the background's bonus languages), so the
 * caller passes the player's picks in `choices`. A missing class, race, or
 * background contributes nothing. This function is pure and does not touch
 * the character.
 * @param {Character} character
 * @param {{ skills?: string[], languages?: string[] }} [choices]
 * @returns {Proficiencies}
 */
export function assembleProficiencies(character, choices = {}) {
  const cls = getClass(primaryClass(character)?.classId);
  const race = resolveRace(character);
  const background = resolveBackground(character);
  return normalizeProficiencies({
    saves: merged(cls?.savingThrows ?? []),
    skills: merged(race?.skills ?? [], background?.skills ?? [], choices.skills ?? []),
    // Expertise is a player's own pick, not a grant, so re-assembling the
    // lists keeps whatever the character already had. The normalizer drops
    // any entry whose skill the new lists no longer grant.
    expertise: getProficiencies(character).expertise,
    // A race's weapon grant is a flat list like the pre-split saves, so the
    // same normalizer sorts every source into the two namespaces.
    weapons: normalizeWeaponProficiencies([
      ...(cls?.weaponCategories ?? []),
      ...(cls?.weaponNamed ?? []),
      ...(race?.weapons ?? []),
    ]),
    armor: merged(cls?.armor ?? []),
    tools: merged(race?.tools ?? [], background?.tools ?? []),
    languages: merged(race?.languages ?? [], choices.languages ?? []),
  });
}

/**
 * Set the character's proficiency lists (the hand-edit path, and how an
 * assembled set is applied). Each list is deduplicated, and a missing list
 * reads as empty. The weapon lists accept either the split shape or a flat
 * legacy list. A patch that says nothing about expertise keeps the character's
 * own, so a caller editing one list does not clear a player's picks. The
 * normalizer then prunes any entry whose skill the new lists no longer grant.
 * This function is pure.
 * @param {Character} character
 * @param {Partial<Proficiencies> & { weapons?: WeaponProficiencies | string[] }} proficiencies
 * @returns {Character}
 */
export function withProficiencies(character, proficiencies) {
  return {
    ...character,
    proficiencies: normalizeProficiencies({
      ...proficiencies,
      expertise: proficiencies.expertise ?? getProficiencies(character).expertise,
    }),
  };
}

/**
 * Set the character's expertise skills, leaving the other lists alone. The
 * list is deduplicated and filtered to skills the character is proficient in.
 * Expertise doubles a proficiency, so it cannot exist without one. This
 * function is pure.
 * @param {Character} character
 * @param {string[]} skillIds
 * @returns {Character}
 */
export function withExpertise(character, skillIds) {
  return withProficiencies(character, { ...getProficiencies(character), expertise: skillIds });
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
  return getProficiencies(character).expertise.includes(skillId);
}
