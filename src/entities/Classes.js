import { abilityModifier, proficiencyBonus } from './Modifiers.js';
import { slotsForCaster } from './SpellSlots.js';

/** @typedef {import('../types/class.js').ClassDef} ClassDef */
/** @typedef {import('../types/class.js').CasterType} CasterType */
/** @typedef {import('../types/spell.js').Ability} Ability */
/** @typedef {import('../types/entities.js').Character} Character */

/**
 * Expand a sparse {level: count} breakpoint map into a 20-entry per-level
 * curve (index 0 = level 1), each entry carrying forward until the next
 * breakpoint. Lookups past level 20 read the last entry.
 * @param {Record<number, number>} breakpoints
 * @returns {number[]}
 */
function curve(breakpoints) {
  const out = [];
  let value = 0;
  for (let level = 1; level <= 20; level++) {
    if (breakpoints[level] !== undefined) value = breakpoints[level];
    out.push(value);
  }
  return out;
}

/**
 * The playable classes and their spellcasting-relevant spine. Non-casters
 * carry casterType 'none', knownRule 'none', and no cantrips, so they simply
 * never gain a spellbook. Cantrip curves follow the SRD breakpoints (3/4/5 for
 * Wizard and Cleric, 2/3/4 for Bard/Druid/Warlock, 4/5/6 for Sorcerer).
 * @type {ClassDef[]}
 */
export const CLASS_LIST = [
  {
    id: 'barbarian',
    name: 'Barbarian',
    hitDie: 12,
    casterType: 'none',
    knownRule: 'none',
    cantripsKnown: [],
  },
  {
    id: 'bard',
    name: 'Bard',
    hitDie: 8,
    casterType: 'full',
    spellAbility: 'CHA',
    spellListId: 'bard',
    knownRule: 'known',
    cantripsKnown: curve({ 1: 2, 4: 3, 10: 4 }),
  },
  {
    id: 'cleric',
    name: 'Cleric',
    hitDie: 8,
    casterType: 'full',
    spellAbility: 'WIS',
    spellListId: 'cleric',
    knownRule: 'prepared',
    cantripsKnown: curve({ 1: 3, 4: 4, 10: 5 }),
  },
  {
    id: 'druid',
    name: 'Druid',
    hitDie: 8,
    casterType: 'full',
    spellAbility: 'WIS',
    spellListId: 'druid',
    knownRule: 'prepared',
    cantripsKnown: curve({ 1: 2, 4: 3, 10: 4 }),
  },
  {
    id: 'fighter',
    name: 'Fighter',
    hitDie: 10,
    casterType: 'none',
    knownRule: 'none',
    cantripsKnown: [],
  },
  {
    id: 'monk',
    name: 'Monk',
    hitDie: 8,
    casterType: 'none',
    knownRule: 'none',
    cantripsKnown: [],
  },
  {
    id: 'paladin',
    name: 'Paladin',
    hitDie: 10,
    casterType: 'half',
    spellAbility: 'CHA',
    spellListId: 'paladin',
    knownRule: 'prepared',
    cantripsKnown: [],
  },
  {
    id: 'ranger',
    name: 'Ranger',
    hitDie: 10,
    casterType: 'half',
    spellAbility: 'WIS',
    spellListId: 'ranger',
    knownRule: 'known',
    cantripsKnown: [],
  },
  {
    id: 'rogue',
    name: 'Rogue',
    hitDie: 8,
    casterType: 'none',
    knownRule: 'none',
    cantripsKnown: [],
  },
  {
    id: 'sorcerer',
    name: 'Sorcerer',
    hitDie: 6,
    casterType: 'full',
    spellAbility: 'CHA',
    spellListId: 'sorcerer',
    knownRule: 'known',
    cantripsKnown: curve({ 1: 4, 4: 5, 10: 6 }),
  },
  {
    id: 'warlock',
    name: 'Warlock',
    hitDie: 8,
    casterType: 'pact',
    spellAbility: 'CHA',
    spellListId: 'warlock',
    knownRule: 'known',
    cantripsKnown: curve({ 1: 2, 4: 3, 10: 4 }),
  },
  {
    id: 'wizard',
    name: 'Wizard',
    hitDie: 6,
    casterType: 'full',
    spellAbility: 'INT',
    spellListId: 'wizard',
    knownRule: 'prepared',
    cantripsKnown: curve({ 1: 3, 4: 4, 10: 5 }),
  },
];

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
