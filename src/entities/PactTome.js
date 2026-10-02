import { getClasses } from './Multiclass.js';

/** @param {SpellCaster} character @returns {number} */
const warlockLevel = (character) =>
  getClasses(character).find((ref) => ref.classId === 'warlock')?.level ?? 0;

/**
 * The Book of Shadows of a Pact of the Tome warlock. The book grants three
 * cantrips from the spell list of any class. They sit in the spellbook's
 * cantrips with the warlock as their source, so they cast as warlock spells
 * with CHA, and `bookOfShadows.cantrips` marks them so the cantrip limit
 * does not count them. With the Book of Ancient Secrets invocation, the book
 * also keeps rituals from any class list in `bookOfShadows.rituals`. The
 * warlock casts those as rituals only, and never with a slot.
 *
 * This module imports only `Multiclass.js`, because `Classes.js` and
 * `SpellView.js` read it and `Invocations.js` imports the spellbook. The
 * invocation check below reads the stored picks and the prerequisites of
 * Book of Ancient Secrets (the Tome boon at 3rd warlock level) directly.
 * Every function here is pure.
 */

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/entities.js').SpellCaster} SpellCaster */
/** @typedef {import('../types/spell.js').Spell} Spell */

/** How many cantrips the Book of Shadows grants. */
export const TOME_CANTRIPS = 3;

/** How many 1st-level rituals Book of Ancient Secrets grants when picked. */
export const FIRST_RITUALS = 2;

/** @param {SpellCaster} character @returns {boolean} */
function hasTome(character) {
  return character.pactBoon === 'tome' && warlockLevel(character) >= 3;
}

/**
 * Whether the character has the Book of Ancient Secrets invocation and the
 * Pact of the Tome it needs.
 * @param {SpellCaster} character
 * @returns {boolean}
 */
export function hasAncientSecrets(character) {
  return hasTome(character) && (character.invocations ?? []).includes('book-of-ancient-secrets');
}

/**
 * The Book of Shadows cantrips the character still knows. Empty without the
 * Pact of the Tome.
 * @param {SpellCaster} character
 * @returns {string[]}
 */
export function tomeCantrips(character) {
  if (!hasTome(character)) return [];
  const known = character.spellbook?.cantrips ?? [];
  return (character.bookOfShadows?.cantrips ?? []).filter((id) => known.includes(id));
}

/**
 * The rituals in the Book of Shadows. Empty without Book of Ancient Secrets.
 * @param {SpellCaster} character
 * @returns {string[]}
 */
export function tomeRituals(character) {
  return hasAncientSecrets(character) ? (character.bookOfShadows?.rituals ?? []) : [];
}

/**
 * How many Book of Shadows cantrips the character can still pick.
 * @param {SpellCaster} character
 * @returns {number}
 */
export function pendingTomeCantrips(character) {
  return hasTome(character) ? Math.max(0, TOME_CANTRIPS - tomeCantrips(character).length) : 0;
}

/**
 * How many of the first 1st-level rituals of Book of Ancient Secrets the
 * character can still pick.
 * @param {SpellCaster} character
 * @returns {number}
 */
export function pendingTomeRituals(character) {
  return hasAncientSecrets(character)
    ? Math.max(0, FIRST_RITUALS - tomeRituals(character).length)
    : 0;
}

/**
 * The highest level of ritual the warlock can copy into the book: half its
 * warlock level, rounded up.
 * @param {SpellCaster} character
 * @returns {number}
 */
export function maxRitualLevel(character) {
  return Math.ceil(warlockLevel(character) / 2);
}

/**
 * The spells that can go in the book: every cantrip for the cantrip picks,
 * and every leveled ritual up to `maxLevel` for the ritual picks, from any
 * class list.
 * @param {Spell[]} spells
 * @param {'cantrip' | 'ritual'} kind
 * @param {number} [maxLevel]
 * @returns {Spell[]}
 */
export function tomeOptions(spells, kind, maxLevel = 9) {
  return kind === 'cantrip'
    ? spells.filter((s) => s.level === 0)
    : spells.filter((s) => s.ritual && s.level > 0 && s.level <= maxLevel);
}

/**
 * The character with these Book of Shadows cantrips, up to three. The old
 * book cantrips leave the spellbook, and the new ones join it with the
 * warlock as their source. A cantrip the spellbook already has from a class
 * stays a class cantrip. The character comes back unchanged without the
 * Pact of the Tome.
 * @param {Character} character
 * @param {string[]} ids
 * @returns {Character}
 */
export function setTomeCantrips(character, ids) {
  if (!hasTome(character)) return character;
  const old = new Set(tomeCantrips(character));
  const book = character.spellbook ?? { cantrips: [], known: [], prepared: [] };
  const kept = book.cantrips.filter((id) => !old.has(id));
  const picked = [...new Set(ids)].filter((id) => !kept.includes(id)).slice(0, TOME_CANTRIPS);
  const sources = Object.fromEntries(
    Object.entries(book.sources ?? {}).filter(([id]) => !old.has(id)),
  );
  for (const id of picked) sources[id] = 'warlock';
  return {
    ...character,
    spellbook: { ...book, cantrips: [...kept, ...picked], sources },
    bookOfShadows: { cantrips: picked, rituals: character.bookOfShadows?.rituals ?? [] },
  };
}

/**
 * The character with these rituals copied into the book. Only a leveled
 * ritual up to `maxRitualLevel` goes in, and a repeat drops. The character
 * comes back unchanged without Book of Ancient Secrets or with nothing new.
 * @param {Character} character
 * @param {Spell[]} spells
 * @returns {Character}
 */
export function addTomeRituals(character, spells) {
  if (!hasAncientSecrets(character)) return character;
  const have = tomeRituals(character);
  const max = maxRitualLevel(character);
  const added = spells
    .filter((s) => s.ritual && s.level > 0 && s.level <= max && !have.includes(s.id))
    .map((s) => s.id);
  if (added.length === 0) return character;
  return {
    ...character,
    bookOfShadows: {
      cantrips: character.bookOfShadows?.cantrips ?? [],
      rituals: [...new Set([...have, ...added])],
    },
  };
}

/**
 * The character with a ritual taken out of the book.
 * @param {Character} character
 * @param {string} id
 * @returns {Character}
 */
export function removeTomeRitual(character, id) {
  const book = character.bookOfShadows;
  if (!book?.rituals.includes(id)) return character;
  return {
    ...character,
    bookOfShadows: { ...book, rituals: book.rituals.filter((r) => r !== id) },
  };
}

/**
 * The character with the grants of a lost tome taken back. Without the Pact
 * of the Tome, the Book of Shadows cantrips leave the spellbook and the book
 * goes. Otherwise they would stay as class cantrips and count against the
 * cantrip limit. Without Book of Ancient Secrets, the book keeps no rituals,
 * so a warlock who takes the invocation again picks two new ones. Only the
 * ids in `bookOfShadows.cantrips` leave, and `setTomeCantrips` never puts a
 * class cantrip there, so a cantrip the warlock learned from a class stays.
 * The character comes back unchanged when nothing needs to go.
 * @param {Character} character
 * @returns {Character}
 */
export function settleTome(character) {
  const book = character.bookOfShadows;
  if (!book) return character;
  if (hasTome(character)) {
    if (hasAncientSecrets(character) || book.rituals.length === 0) return character;
    return { ...character, bookOfShadows: { ...book, rituals: [] } };
  }
  const { bookOfShadows: _book, ...rest } = character;
  const granted = new Set(book.cantrips);
  const spells = character.spellbook;
  if (!spells) return rest;
  const sources = Object.fromEntries(
    Object.entries(spells.sources ?? {}).filter(([id]) => !granted.has(id)),
  );
  return {
    ...rest,
    spellbook: {
      ...spells,
      cantrips: spells.cantrips.filter((id) => !granted.has(id)),
      ...(spells.sources ? { sources } : {}),
    },
  };
}
