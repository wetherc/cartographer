import { abilityModifier, proficiencyBonus } from './Modifiers.js';
import { slotsForCaster, slotPoolsForCaster } from './SpellSlots.js';
import { getClasses } from './Multiclass.js';
import { DEFAULT_CLASSES } from '../data/classes.js';
import { memoizeByIdentity } from '../util/memoize.js';
import { clamp } from '../util/num.js';

/** @typedef {import('../types/class.js').ClassDef} ClassDef */
/** @typedef {import('../types/class.js').CasterType} CasterType */
/** @typedef {import('../types/class.js').ClassRef} ClassRef */
/** @typedef {import('../types/spell.js').Ability} Ability */
/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/entities.js').SpellCaster} SpellCaster */

/**
 * The playable classes. The definitions themselves live in data/classes.js
 * (library-kind shaped, with a stable id and name per entry). This module
 * holds the logic that reads them.
 * @type {ClassDef[]}
 */
export const CLASS_LIST = DEFAULT_CLASSES;

/** The classes indexed by id, for O(1) lookup.
 * @type {Map<string, ClassDef>} */
const CLASS_BY_ID = new Map(CLASS_LIST.map((c) => [c.id, c]));

/**
 * The class definition for an id, or null for an unknown or absent class (a
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
 * leveled slots here. A different function handles pact magic.
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
 * The full spell-slot pools for a class at a character level, all at full.
 * This is caster-type-aware (full, half, third), so a creature caster
 * gets exactly the slots its class grants. Empty for a non-caster, pact
 * caster, or unknown class.
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
 * Cantrips known for a class at a character level, from its cantrip curve.
 * Returns 0 for classes that know no cantrips, or for an unknown class.
 * Levels past the curve read its last entry.
 * @param {string | undefined | null} classId
 * @param {number} characterLevel
 * @returns {number}
 */
export function cantripsKnownForClass(classId, characterLevel) {
  const def = getClass(classId);
  if (!def || def.cantripsKnown.length === 0) return 0;
  const idx = clamp(Math.floor(characterLevel) || 1, 1, def.cantripsKnown.length) - 1;
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
 * Whether the character can cast rituals: true when any of its caster
 * classes has ritual casting (Bard, Cleric, Druid, Wizard). A ritual spell
 * is castable without a slot only by a caster whose class grants the
 * feature. This gates the cast dialog's ritual option.
 * @param {SpellCaster} character
 * @returns {boolean}
 */
export function hasRitualCasting(character) {
  return casterClassRefs(character).some((ref) => !!getClass(ref.classId)?.ritual);
}

/**
 * The character's first caster class, or null. This is the class whose
 * ability powers spells when a caller does not name one.
 * @param {SpellCaster} character
 * @returns {ClassRef | null}
 */
export function primaryCasterClass(character) {
  return casterClassRefs(character)[0] ?? null;
}

/**
 * Whether any of the character's caster classes prepares its spells (Cleric,
 * Druid, Paladin, Wizard). This gates the prepared count and the Prepare
 * actions. A known-rule caster (Bard, Ranger, Sorcerer, Warlock) never
 * prepares.
 * @param {Character} character
 * @returns {boolean}
 */
export function hasPreparedCaster(character) {
  return casterClassRefs(character).some((ref) => getClass(ref.classId)?.knownRule === 'prepared');
}

/**
 * The modifier of a caster's spell ability, or null when the character has no
 * caster class or lacks that ability score. `classId` picks which class's
 * ability to read. It defaults to the first caster class.
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
 * A caster's spell save DC: 8 plus proficiency bonus plus spell-ability
 * modifier. Proficiency reads the total character level (the 5e multiclass
 * rule). The ability comes from `classId`, defaulting to the first caster
 * class. Returns null for a non-caster.
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
 * A caster's spell attack bonus: proficiency bonus plus spell-ability
 * modifier, with the same class selection as `spellSaveDC`. Returns null
 * for a non-caster.
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
 * How many cantrips a character can know: each caster class's cantrip curve
 * read at its own class level, summed. Returns 0 for a non-caster or a
 * classless character.
 *
 * This value is memoized on the character, like `preparedLimit`. The
 * spellbook panel asks for both limits once per listed spell, and
 * `preparedLimit` re-resolves a spell ability modifier per class each time.
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
 * How many leveled spells a character can have prepared: per prepared-rule
 * caster class, its spell-ability modifier plus its class level, at least 1
 * (the 5e prepared-caster rule), summed across those classes. Returns 0 for
 * a non-caster, or for a caster whose classes all cast from their known
 * list, since those classes grant no prepared slots. This value is
 * memoized on the character.
 */
export const preparedLimit = memoizeByIdentity(countPreparedAllowed);

/**
 * @param {Character} character
 * @returns {number}
 */
function countPreparedAllowed(character) {
  return casterClassRefs(character).reduce((sum, ref) => {
    if (getClass(ref.classId)?.knownRule !== 'prepared') return sum;
    const mod = spellAbilityModifier(character, ref.classId);
    return mod === null ? sum : sum + Math.max(1, mod + ref.level);
  }, 0);
}
