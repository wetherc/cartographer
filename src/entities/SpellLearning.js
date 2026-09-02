import { getClass, casterClassRefs } from './Classes.js';
import { slotsForCaster, pactSlotsFor } from './SpellSlots.js';

/** @typedef {import('../types/entities.js').SpellCaster} SpellCaster */
/** @typedef {import('../types/spell.js').Spell} Spell */

/**
 * Which spells a character can learn. Each caster class learns as if it were
 * a single-class caster of its own class level, which is the 5e multiclass
 * rule. A cleric 3 / wizard 3 has third-level slots from the combined table,
 * but each class learns second-level spells at most, so Fireball stays out
 * of reach. The combined slot level is the wrong cap for that reason, and
 * this module never reads the character's pools.
 *
 * Every function is pure.
 */

/**
 * The highest spell level one class can learn at its class level: the top
 * row of its own slot table, or the pact slot level for a warlock. A class
 * with no slots yet (a paladin 1) or outside the catalog learns cantrips
 * only, and the result is 0.
 * @param {string} classId
 * @param {number} classLevel
 * @returns {number}
 */
export function classSpellLevelCap(classId, classLevel) {
  const def = getClass(classId);
  if (!def) return 0;
  if (def.casterType === 'pact') return pactSlotsFor(classLevel)?.level ?? 0;
  return slotsForCaster(def.casterType, classLevel).length;
}

/**
 * Whether one of the character's caster classes can learn a spell. The
 * spell must be on that class's list. A cantrip needs nothing more. A
 * leveled spell must also sit at or under that class's own level cap.
 * @param {SpellCaster} character
 * @param {Spell} spell
 * @returns {boolean}
 */
export function canLearnSpell(character, spell) {
  return casterClassRefs(character).some(
    (ref) =>
      spell.classes.includes(ref.classId) &&
      (spell.level === 0 || spell.level <= classSpellLevelCap(ref.classId, ref.level)),
  );
}

/**
 * The spells from a catalog that the character can learn, in catalog order.
 * The Spellbook tab offers this list, so it never shows a spell the
 * character has no class to learn it with.
 * @param {SpellCaster} character
 * @param {Spell[]} spells
 * @returns {Spell[]}
 */
export function learnableSpells(character, spells) {
  return spells.filter((spell) => canLearnSpell(character, spell));
}
