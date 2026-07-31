import { getSpellbook, spellSource } from './Character.js';
import { getClass, primaryCasterClass } from './Classes.js';

/** @typedef {import('../types/spell.js').Spell} Spell */
/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/entities.js').SpellCaster} SpellCaster */

/**
 * A group heading for a spell level: "Cantrips" for level 0, "Level N"
 * otherwise. Used by the spellbook list and the sheet's read-only sections.
 * @param {number} level
 * @returns {string}
 */
export function spellLevelLabel(level) {
  return level === 0 ? 'Cantrips' : `Level ${level}`;
}

/**
 * Group spells by level for display: one entry per distinct level present,
 * ascending, each carrying its heading label and the level's spells sorted by
 * name. Duplicate ids collapse to one (a known spell also offered as learnable
 * appears once). Pure.
 * @param {Spell[]} spells
 * @returns {{ level: number, label: string, spells: Spell[] }[]}
 */
export function groupSpellsByLevel(spells) {
  /** @type {Map<number, Map<string, Spell>>} */
  const byLevel = new Map();
  for (const spell of spells) {
    let bucket = byLevel.get(spell.level);
    if (!bucket) {
      bucket = new Map();
      byLevel.set(spell.level, bucket);
    }
    if (!bucket.has(spell.id)) bucket.set(spell.id, spell);
  }
  return [...byLevel.keys()]
    .sort((a, b) => a - b)
    .map((level) => ({
      level,
      label: spellLevelLabel(level),
      spells: [...(byLevel.get(level) ?? new Map()).values()].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    }));
}

/**
 * Which known-rule governs a leveled spell for this character: the rule of the
 * class it was learned under, falling back to the first caster class when no
 * source was recorded (a single-class book, or an older save). `'known'` when
 * even that class is unknown, so a legacy character keeps casting what it
 * knows. Pure.
 * @param {SpellCaster} character
 * @param {string} spellId
 * @returns {import('../types/class.js').SpellKnownRule}
 */
export function spellRule(character, spellId) {
  const classId = spellSource(character, spellId) ?? primaryCasterClass(character)?.classId;
  return getClass(classId)?.knownRule ?? 'known';
}

/**
 * Whether a leveled spell id is castable from this book: a spell under a
 * prepared-rule class casts from the prepared list, one under a known-rule
 * class from the known list.
 * @param {SpellCaster} character
 * @param {import('../types/entities.js').Spellbook} book
 * @param {string} spellId
 * @returns {boolean}
 */
function castableFromBook(character, book, spellId) {
  const list = spellRule(character, spellId) === 'prepared' ? book.prepared : book.known;
  return list.includes(spellId);
}

/**
 * Whether the character can cast this spell from its spellbook right now: a
 * cantrip must be in the cantrip list; a leveled spell learned under a
 * prepared-rule class (Cleric, Druid, Paladin, Wizard) must be prepared, while
 * a known-rule caster's spells (Bard, Ranger, Sorcerer, Warlock) cast straight
 * from the known list. Pure.
 * @param {SpellCaster} character
 * @param {Spell} spell
 * @returns {boolean}
 */
export function isSpellCastable(character, spell) {
  const book = getSpellbook(character);
  if (spell.level === 0) return book.cantrips.includes(spell.id);
  return castableFromBook(character, book, spell.id);
}

/**
 * The leveled spell ids the character can cast right now, in spellbook order:
 * every known spell under a known-rule class, plus the prepared ones under a
 * prepared-rule class. Cantrips are not included; read `spellbook.cantrips`
 * directly. Pure.
 * @param {SpellCaster} character
 * @returns {string[]}
 */
export function castableLeveledIds(character) {
  const book = getSpellbook(character);
  const ids = [...new Set([...book.known, ...book.prepared])];
  return ids.filter((id) => castableFromBook(character, book, id));
}

/**
 * A spell's standing in a character's spellbook, for badges and available
 * actions: whether it is a cantrip, whether it is known (cantrips count as
 * known), whether it is prepared, and whether preparing is how this spell
 * becomes castable at all (`preparable`: true only under a prepared-rule
 * class; a known-rule caster's spells never show prepare actions). Pure.
 * @param {Character} character
 * @param {Spell} spell
 * @returns {{ cantrip: boolean, known: boolean, prepared: boolean, preparable: boolean }}
 */
export function spellStatus(character, spell) {
  const book = getSpellbook(character);
  const cantrip = spell.level === 0;
  const known = cantrip ? book.cantrips.includes(spell.id) : book.known.includes(spell.id);
  const prepared = !cantrip && book.prepared.includes(spell.id);
  const preparable = !cantrip && spellRule(character, spell.id) === 'prepared';
  return { cantrip, known, prepared, preparable };
}
