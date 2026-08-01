import { getSpellbook, spellSource } from './Character.js';
import { getClass, primaryCasterClass } from './Classes.js';

/** @typedef {import('../types/spell.js').Spell} Spell */
/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/entities.js').SpellCaster} SpellCaster */

/**
 * A group heading for a spell level: "Cantrips" for level 0, "Level N"
 * otherwise. The spellbook list and the sheet's read-only sections use this
 * heading.
 * @param {number} level
 * @returns {string}
 */
export function spellLevelLabel(level) {
  return level === 0 ? 'Cantrips' : `Level ${level}`;
}

/**
 * Group spells by level for display. Each level present gets one entry, in
 * ascending order, and each entry carries its heading label and the level's
 * spells sorted by name. Duplicate ids collapse to one, so a known spell
 * that is also offered as learnable appears once. This function is pure.
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
 * Which known-rule governs a leveled spell for this character. The function
 * uses the rule of the class that the character learned the spell under. It
 * falls back to the first caster class when the book records no source (a
 * single-class book, or an older save). The function returns `'known'` when
 * even that class is unknown, so a legacy character keeps casting what it
 * knows. This function is pure.
 * @param {SpellCaster} character
 * @param {string} spellId
 * @returns {import('../types/class.js').SpellKnownRule}
 */
export function spellRule(character, spellId) {
  const classId = spellSource(character, spellId) ?? primaryCasterClass(character)?.classId;
  return getClass(classId)?.knownRule ?? 'known';
}

/**
 * Whether a leveled spell id is castable from this book. A spell under a
 * prepared-rule class casts from the prepared list. A spell under a
 * known-rule class casts from the known list.
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
 * Whether the character can cast this spell from its spellbook right now. A
 * cantrip must be in the cantrip list. A leveled spell learned under a
 * prepared-rule class (Cleric, Druid, Paladin, Wizard) must be prepared. A
 * known-rule caster's spells (Bard, Ranger, Sorcerer, Warlock) cast straight
 * from the known list. This function is pure.
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
 * The leveled spell ids the character can cast right now, in spellbook
 * order. The list holds every known spell under a known-rule class, plus
 * the prepared ones under a prepared-rule class. Cantrips are not included.
 * Read `spellbook.cantrips` directly for cantrips. This function is pure.
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
 * actions. It reports whether the spell is a cantrip, whether it is known
 * (cantrips count as known), and whether it is prepared. It also reports
 * whether preparing is how this spell becomes castable at all (`preparable`
 * is true only under a prepared-rule class). A known-rule caster's spells
 * never show prepare actions. This function is pure.
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
