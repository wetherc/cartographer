import { abilityModifier, proficiencyBonus } from './Modifiers.js';
import { slotsForCaster, slotPoolsForCaster } from './SpellSlots.js';
import { getClasses } from './Multiclass.js';
import { DEFAULT_CLASSES } from '../data/classes.js';
import { memoizeByIdentity } from '../util/memoize.js';

/** @typedef {import('../types/class.js').ClassDef} ClassDef */
/** @typedef {import('../types/class.js').CasterType} CasterType */
/** @typedef {import('../types/class.js').ClassRef} ClassRef */
/** @typedef {import('../types/spell.js').Ability} Ability */
/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/entities.js').SpellCaster} SpellCaster */

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
 * The character's caster classes: every class-list entry whose class casts
 * (full/half/third/pact). Empty for a martial or classless character.
 * @param {SpellCaster} character
 * @returns {ClassRef[]}
 */
export function casterClassRefs(character) {
  return getClasses(character).filter((ref) => isCasterClass(ref.classId));
}

/**
 * Whether the character can cast rituals: true when any of its caster classes
 * has ritual casting (Bard, Cleric, Druid, Wizard). A ritual spell is only
 * castable without a slot by a caster whose class grants the feature, so this is
 * what gates the cast dialog's ritual option.
 * @param {SpellCaster} character
 * @returns {boolean}
 */
export function hasRitualCasting(character) {
  return casterClassRefs(character).some((ref) => !!getClass(ref.classId)?.ritual);
}

/**
 * The character's first caster class, or null — the class whose ability powers
 * spells when a caller doesn't name one.
 * @param {SpellCaster} character
 * @returns {ClassRef | null}
 */
export function primaryCasterClass(character) {
  return casterClassRefs(character)[0] ?? null;
}

/**
 * The modifier of a caster's spell ability, or null when the character has no
 * caster class or lacks that ability score. `classId` picks which class's
 * ability to read; it defaults to the first caster class.
 * @param {SpellCaster} character
 * @param {string} [classId]
 * @returns {number | null}
 */
export function spellAbilityModifier(character, classId) {
  const def = getClass(classId ?? primaryCasterClass(character)?.classId);
  if (!def || !def.spellAbility) return null;
  const score = character.stats?.[def.spellAbility];
  if (typeof score !== 'number') return null;
  return abilityModifier(score);
}

/**
 * A caster's spell save DC: 8 + proficiency bonus + spell-ability modifier.
 * Proficiency reads the total character level (the 5e multiclass rule); the
 * ability comes from `classId`, defaulting to the first caster class. Null for
 * a non-caster.
 * @param {SpellCaster} character
 * @param {string} [classId]
 * @returns {number | null}
 */
export function spellSaveDC(character, classId) {
  const mod = spellAbilityModifier(character, classId);
  if (mod === null) return null;
  return 8 + proficiencyBonus(character.level) + mod;
}

/**
 * A caster's spell attack bonus: proficiency bonus + spell-ability modifier,
 * with the same class selection as `spellSaveDC`. Null for a non-caster.
 * @param {SpellCaster} character
 * @param {string} [classId]
 * @returns {number | null}
 */
export function spellAttackBonus(character, classId) {
  const mod = spellAbilityModifier(character, classId);
  if (mod === null) return null;
  return proficiencyBonus(character.level) + mod;
}

/**
 * How many cantrips a character may know: each caster class's cantrip curve
 * read at its own class level, summed. 0 for a non-caster or a classless
 * character.
 *
 * Memoized on the character, like `preparedLimit`: the spellbook panel asks
 * for both limits once per listed spell, and `preparedLimit` re-resolves a
 * spell ability modifier per class each time.
 */
export const cantripLimit = memoizeByIdentity(countCantripsKnown);

/**
 * @param {Character} character
 * @returns {number}
 */
function countCantripsKnown(character) {
  return casterClassRefs(character).reduce(
    (sum, ref) => sum + cantripsKnownForClass(ref.classId, ref.level),
    0,
  );
}

/**
 * How many leveled spells a character may have prepared: per caster class, its
 * spell-ability modifier + its class level, at least 1 (the 5e prepared-caster
 * rule), summed across classes. 0 for a non-caster. Known-list casters don't
 * prepare, but the same ceiling bounds the spellbook's active set here.
 * Memoized on the character.
 */
export const preparedLimit = memoizeByIdentity(countPreparedAllowed);

/**
 * @param {Character} character
 * @returns {number}
 */
function countPreparedAllowed(character) {
  return casterClassRefs(character).reduce((sum, ref) => {
    const mod = spellAbilityModifier(character, ref.classId);
    return mod === null ? sum : sum + Math.max(1, mod + ref.level);
  }, 0);
}
