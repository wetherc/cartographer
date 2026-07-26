import { abilityModifier, proficiencyBonus } from './Modifiers.js';
import { slotsForCaster, slotPoolsForCaster } from './SpellSlots.js';
import { DEFAULT_CLASSES } from '../data/classes.js';

/** @typedef {import('../types/class.js').ClassDef} ClassDef */
/** @typedef {import('../types/class.js').CasterType} CasterType */
/** @typedef {import('../types/spell.js').Ability} Ability */
/** @typedef {import('../types/entities.js').Character} Character */

/**
 * The playable classes. The definitions themselves live in data/classes.js
 * (library-kind shaped, stable id + name per entry); this module holds the
 * logic that reads them.
 * @type {ClassDef[]}
 */
export const CLASS_LIST = DEFAULT_CLASSES;

/** The classes indexed by id, for O(1) lookup.
 * @type {Map<string, ClassDef>} */
const CLASS_BY_ID = new Map(CLASS_LIST.map((c) => [c.id, c]));

/**
 * The class definition for an id, or null for an unknown/absent class (a
 * classless legacy character).
 * @param {string | undefined | null} classId
 * @returns {ClassDef | null}
 */
export function getClass(classId) {
  return (classId && CLASS_BY_ID.get(classId)) || null;
}

/**
 * Whether a class casts spells at all (full/half/third/pact, not none).
 * @param {string | undefined | null} classId
 * @returns {boolean}
 */
export function isCasterClass(classId) {
  const def = getClass(classId);
  return !!def && def.casterType !== 'none';
}

/**
 * Slot counts per spell level for a class at a character level, driven by the
 * class's caster type. A non-caster, pact caster, or unknown class gets no
 * leveled slots here (pact magic is handled separately).
 * @param {string | undefined | null} classId
 * @param {number} characterLevel
 * @returns {number[]} index 0 = spell level 1
 */
export function slotsForClass(classId, characterLevel) {
  const def = getClass(classId);
  if (!def) return [];
  return slotsForCaster(def.casterType, characterLevel);
}

/**
 * The full spell-slot pools for a class at a character level, all at full —
 * caster-type-aware (full/half/third), so a foe or NPC caster gets exactly the
 * slots its class grants. Empty for a non-caster, pact caster, or unknown class.
 * @param {string | undefined | null} classId
 * @param {number} characterLevel
 * @returns {import('../types/entities.js').ResourcePool[]}
 */
export function casterSlots(classId, characterLevel) {
  const def = getClass(classId);
  if (!def) return [];
  return slotPoolsForCaster(def.casterType, characterLevel);
}

/**
 * Cantrips known for a class at a character level, from its cantrip curve;
 * 0 for classes that know no cantrips or an unknown class. Levels past the
 * curve read its last entry.
 * @param {string | undefined | null} classId
 * @param {number} characterLevel
 * @returns {number}
 */
export function cantripsKnownForClass(classId, characterLevel) {
  const def = getClass(classId);
  if (!def || def.cantripsKnown.length === 0) return 0;
  const idx = Math.min(Math.max(1, Math.floor(characterLevel) || 1), def.cantripsKnown.length) - 1;
  return def.cantripsKnown[idx];
}

/**
 * The modifier of a caster's spell ability, or null when the character has no
 * caster class or lacks that ability score.
 * @param {Character} character
 * @returns {number | null}
 */
export function spellAbilityModifier(character) {
  const def = getClass(character.class);
  if (!def || !def.spellAbility) return null;
  const score = character.stats?.[def.spellAbility];
  if (typeof score !== 'number') return null;
  return abilityModifier(score);
}

/**
 * A caster's spell save DC: 8 + proficiency bonus + spell-ability modifier.
 * Null for a non-caster.
 * @param {Character} character
 * @returns {number | null}
 */
export function spellSaveDC(character) {
  const mod = spellAbilityModifier(character);
  if (mod === null) return null;
  return 8 + proficiencyBonus(character.level) + mod;
}

/**
 * A caster's spell attack bonus: proficiency bonus + spell-ability modifier.
 * Null for a non-caster.
 * @param {Character} character
 * @returns {number | null}
 */
export function spellAttackBonus(character) {
  const mod = spellAbilityModifier(character);
  if (mod === null) return null;
  return proficiencyBonus(character.level) + mod;
}

/**
 * How many cantrips a character may know, from its class's cantrip curve at its
 * level; 0 for a non-caster or a classless character.
 * @param {Character} character
 * @returns {number}
 */
export function cantripLimit(character) {
  return cantripsKnownForClass(character.class, character.level ?? 1);
}

/**
 * How many leveled spells a character may have prepared: spell-ability modifier
 * + character level, at least 1 (the 5e prepared-caster rule). 0 for a
 * non-caster. Known-list casters don't prepare, but the same ceiling bounds the
 * spellbook's active set here.
 * @param {Character} character
 * @returns {number}
 */
export function preparedLimit(character) {
  const mod = spellAbilityModifier(character);
  if (mod === null) return 0;
  return Math.max(1, mod + (character.level ?? 1));
}
