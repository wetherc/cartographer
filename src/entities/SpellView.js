import { getSpellbook } from './Character.js';

/** @typedef {import('../types/spell.js').Spell} Spell */
/** @typedef {import('../types/entities.js').Character} Character */

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
 * A spell's standing in a character's spellbook, for badges and available
 * actions: whether it is a cantrip, whether it is known (cantrips count as
 * known), and whether it is prepared. Pure.
 * @param {Character} character
 * @param {Spell} spell
 * @returns {{ cantrip: boolean, known: boolean, prepared: boolean }}
 */
export function spellStatus(character, spell) {
  const book = getSpellbook(character);
  const cantrip = spell.level === 0;
  const known = cantrip ? book.cantrips.includes(spell.id) : book.known.includes(spell.id);
  const prepared = !cantrip && book.prepared.includes(spell.id);
  return { cantrip, known, prepared };
}
