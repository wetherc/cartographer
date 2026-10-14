import { getSpellbook } from './Character.js';
import { casterClassRefs } from './Classes.js';
import { casterName, casterTypeOf, subclassDef } from './ClassCasting.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/spell.js').Spell} Spell */
/** @typedef {import('../types/spell.js').SpellSchool} SpellSchool */

/**
 * The spell rules of the two third-caster subclasses, the Arcane Trickster
 * and the Eldritch Knight, as sheet warnings. Each one knows a fixed number
 * of leveled spells for its class level. Most of them come from two
 * schools, and only the picks at class levels 3, 8, 14, and 20 may come
 * from any school. An Arcane Trickster also always knows Mage Hand. The
 * Spellbook tab lets a GM learn any wizard spell, so these rules warn and
 * never block.
 *
 * Every function is pure.
 */

/** @type {Record<string, { schools: SpellSchool[], cantrip?: string }>} */
const RULES = {
  'arcane-trickster': { schools: ['enchantment', 'illusion'], cantrip: 'mage-hand' },
  'eldritch-knight': { schools: ['abjuration', 'evocation'] },
};

/** Class level to leveled spells known, from the 5e subclass tables. */
const KNOWN = [
  [3, 3],
  [4, 4],
  [7, 5],
  [8, 6],
  [10, 7],
  [11, 8],
  [13, 9],
  [14, 10],
  [16, 11],
  [19, 12],
  [20, 13],
];

/** The class levels whose new spell may come from any school. */
const FREE_PICK_LEVELS = [3, 8, 14, 20];

/**
 * The leveled spells a third caster of this class level knows. Zero below
 * level 3, where the subclass does not cast yet.
 * @param {number} classLevel
 * @returns {number}
 */
export function thirdCasterSpellsKnown(classLevel) {
  let known = 0;
  for (const [level, count] of KNOWN) if (classLevel >= level) known = count;
  return known;
}

/**
 * How many known spells may come from outside the two schools.
 * @param {number} classLevel
 * @returns {number}
 */
export function freeSchoolPicks(classLevel) {
  return FREE_PICK_LEVELS.filter((level) => classLevel >= level).length;
}

/**
 * The warnings for one character's third-caster spells, one sentence each.
 * A spell counts toward a class when the spellbook records it under that
 * class, or when it has no record and the class is the first caster class.
 * An id that `resolveSpells` does not know drops out.
 * @param {Character} character
 * @param {(ids: string[]) => Spell[]} resolveSpells
 * @returns {string[]}
 */
export function thirdCasterSpellIssues(character, resolveSpells) {
  const refs = casterClassRefs(character);
  const book = getSpellbook(character);
  const sources = book.sources ?? {};
  /** @type {string[]} */
  const issues = [];
  for (const ref of refs) {
    const rule = RULES[subclassDef(ref.classId, ref.subclass)?.id ?? ''];
    if (!rule || casterTypeOf(ref) !== 'third') continue;
    const name = `${casterName(ref)} ${ref.level}`;
    /** @param {string} id */
    const ownsSpell = (id) => (sources[id] ?? refs[0].classId) === ref.classId;
    const leveled = resolveSpells(book.known.filter(ownsSpell)).filter((s) => s.level > 0);
    const limit = thirdCasterSpellsKnown(ref.level);
    if (leveled.length > limit) {
      issues.push(`${name} knows ${limit} leveled spells, and this sheet has ${leveled.length}.`);
    }
    const offSchool = leveled.filter((s) => !rule.schools.includes(s.school));
    const free = freeSchoolPicks(ref.level);
    if (offSchool.length > free) {
      issues.push(
        `${name} may know ${free} ${free === 1 ? 'spell' : 'spells'} outside ` +
          `${rule.schools.join(' and ')}, and this sheet has ${offSchool.length}: ` +
          `${offSchool
            .map((s) => s.name)
            .sort()
            .join(', ')}.`,
      );
    }
    if (rule.cantrip && !book.cantrips.includes(rule.cantrip)) {
      const [cantrip] = resolveSpells([rule.cantrip]);
      issues.push(`${name} always knows ${cantrip?.name ?? rule.cantrip}.`);
    }
  }
  return issues;
}
