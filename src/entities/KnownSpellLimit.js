import { getSpellbook } from './Character.js';
import { casterClassRefs, getClass } from './Classes.js';
import { casterName } from './ClassCasting.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/spell.js').Spell} Spell */

/**
 * The spells-known limit of the four classes that learn a fixed number of
 * leveled spells: the Bard, the Sorcerer, the Warlock, and the Ranger. The
 * Spellbook tab lets a GM learn any spell, so this rule warns on the sheet
 * and never blocks, the same way the third-caster rules in
 * `ThirdCasterSpells.js` do.
 *
 * Every function is pure.
 */

/**
 * The leveled spells a class of this class level knows, or null when the
 * class has no `spellsKnown` table.
 * @param {string} classId
 * @param {number} classLevel
 * @returns {number | null}
 */
export function classSpellsKnown(classId, classLevel) {
  const table = getClass(classId)?.spellsKnown;
  if (!table || table.length === 0) return null;
  const index = Math.min(Math.max(Math.floor(classLevel) || 1, 1), table.length) - 1;
  return table[index];
}

/**
 * The warnings for a character whose known-caster classes know more leveled
 * spells than their tables allow, one sentence each. A spell counts toward a
 * class when the spellbook records it under that class, or when it has no
 * record and the class is the first caster class. A warlock's Mystic Arcanum
 * spells (6th level and up) do not count. An id that `resolveSpells` does
 * not know drops out.
 * @param {Character} character
 * @param {(ids: string[]) => Spell[]} resolveSpells
 * @returns {string[]}
 */
export function knownSpellIssues(character, resolveSpells) {
  const refs = casterClassRefs(character);
  const book = getSpellbook(character);
  const sources = book.sources ?? {};
  /** @type {string[]} */
  const issues = [];
  for (const ref of refs) {
    const limit = classSpellsKnown(ref.classId, ref.level);
    if (limit === null) continue;
    const top = ref.classId === 'warlock' ? 5 : 9;
    /** @param {string} id */
    const ownsSpell = (id) => (sources[id] ?? refs[0].classId) === ref.classId;
    const leveled = resolveSpells(book.known.filter(ownsSpell)).filter(
      (s) => s.level > 0 && s.level <= top,
    );
    if (leveled.length > limit) {
      issues.push(
        `${casterName(ref)} ${ref.level} knows ${limit} leveled spells, and this sheet has ${leveled.length}.`,
      );
    }
  }
  return issues;
}
