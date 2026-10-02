import { cantripLimit, preparedLimit } from './Classes.js';

/**
 * A character's spellbook: its cantrips, known spells, and prepared spells,
 * and the class that each spell belongs to. The learn and prepare writes
 * respect the class limits of `Classes.cantripLimit` and
 * `Classes.preparedLimit`. `Character.js` re-exports every function here,
 * because most callers import the character model from there. Every
 * function here is pure.
 */

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/entities.js').Spellbook} Spellbook */
/** @typedef {import('../types/entities.js').SpellCaster} SpellCaster */

/** @returns {Spellbook} an empty spellbook (no cantrips, known, or prepared). */
export function emptySpellbook() {
  return { cantrips: [], known: [], prepared: [] };
}

/**
 * A detached copy of a spellbook, arrays and the sources map included. Used
 * where a library template's spellbook is stamped onto a campaign entity.
 * The template is shared, read-only data, so the entity needs its own lists
 * to learn or prepare spells through. This function is pure.
 * @param {Spellbook} book
 * @returns {Spellbook}
 */
export function copySpellbook(book) {
  return {
    cantrips: [...(book.cantrips ?? [])],
    known: [...(book.known ?? [])],
    prepared: [...(book.prepared ?? [])],
    ...(book.sources ? { sources: { ...book.sources } } : {}),
  };
}

/**
 * A character's spellbook, or an empty one for a character that predates
 * spellbooks (so callers never guard against undefined).
 * @param {{ spellbook?: Spellbook }} character
 * @returns {Spellbook}
 */
export function getSpellbook(character) {
  return character.spellbook ?? emptySpellbook();
}

/**
 * Record which class a spell was learned under, when the caller names one.
 * @param {Spellbook} book
 * @param {string} spellId
 * @param {string} [classId]
 * @returns {Spellbook}
 */
function withSource(book, spellId, classId) {
  if (!classId) return book;
  return { ...book, sources: { ...book.sources, [spellId]: classId } };
}

/**
 * Drop a forgotten spell's source record, if it had one.
 * @param {Spellbook} book
 * @param {string} spellId
 * @returns {Spellbook}
 */
function withoutSource(book, spellId) {
  if (!book.sources || !(spellId in book.sources)) return book;
  const sources = { ...book.sources };
  delete sources[spellId];
  return { ...book, sources };
}

/**
 * The class a spell was learned under, or null when none was recorded (a
 * single-class book, or an older save). Casting falls back to the first
 * caster class then.
 * @param {{ spellbook?: Spellbook }} character
 * @param {string} spellId
 * @returns {string | null}
 */
export function spellSource(character, spellId) {
  return getSpellbook(character).sources?.[spellId] ?? null;
}

/**
 * Learn a cantrip, up to the class's cantrip limit. A duplicate, or a learn
 * that exceeds the limit leaves the character unchanged. `classId`
 * (optional) records which class the cantrip is learned under, for a
 * multiclass caster's per-class spell ability. This function is pure.
 * @param {Character} character
 * @param {string} spellId
 * @param {string} [classId]
 * @returns {Character}
 */
export function learnCantrip(character, spellId, classId) {
  const book = getSpellbook(character);
  if (book.cantrips.includes(spellId) || book.cantrips.length >= cantripLimit(character)) {
    return character;
  }
  const next = withSource({ ...book, cantrips: [...book.cantrips, spellId] }, spellId, classId);
  return { ...character, spellbook: next };
}

/**
 * Forget a cantrip. Absent from the list -> unchanged. This function is pure.
 * @param {Character} character
 * @param {string} spellId
 * @returns {Character}
 */
export function unlearnCantrip(character, spellId) {
  const book = getSpellbook(character);
  const next = withoutSource(
    { ...book, cantrips: book.cantrips.filter((id) => id !== spellId) },
    spellId,
  );
  // A forgotten Book of Shadows cantrip leaves the book too, so the same id
  // learned again from a class list counts as a class cantrip.
  const tome = character.bookOfShadows;
  if (!tome?.cantrips.includes(spellId)) return { ...character, spellbook: next };
  return {
    ...character,
    spellbook: next,
    bookOfShadows: { ...tome, cantrips: tome.cantrips.filter((id) => id !== spellId) },
  };
}

/**
 * Add a leveled spell to the known list. A duplicate leaves the character
 * unchanged. Known-list size is not capped here (no spells-known curve is
 * modeled yet). The prepared set is what the prepared limit bounds.
 * `classId` (optional) records which class the spell is learned under. This
 * function is pure.
 * @param {Character} character
 * @param {string} spellId
 * @param {string} [classId]
 * @returns {Character}
 */
export function learnSpell(character, spellId, classId) {
  const book = getSpellbook(character);
  if (book.known.includes(spellId)) return character;
  const next = withSource({ ...book, known: [...book.known, spellId] }, spellId, classId);
  return { ...character, spellbook: next };
}

/**
 * Forget a leveled spell, dropping it from both the known and prepared lists.
 * This function is pure.
 * @param {Character} character
 * @param {string} spellId
 * @returns {Character}
 */
export function unlearnSpell(character, spellId) {
  const book = getSpellbook(character);
  const next = withoutSource(
    {
      ...book,
      known: book.known.filter((id) => id !== spellId),
      prepared: book.prepared.filter((id) => id !== spellId),
    },
    spellId,
  );
  return { ...character, spellbook: next };
}

/**
 * Prepare a known leveled spell, up to the prepared limit. A spell not in the
 * known list, a duplicate, or a prepare that exceeds the limit leaves the
 * character unchanged. This function is pure.
 * @param {Character} character
 * @param {string} spellId
 * @returns {Character}
 */
export function prepareSpell(character, spellId) {
  const book = getSpellbook(character);
  if (
    !book.known.includes(spellId) ||
    book.prepared.includes(spellId) ||
    book.prepared.length >= preparedLimit(character)
  ) {
    return character;
  }
  return { ...character, spellbook: { ...book, prepared: [...book.prepared, spellId] } };
}

/**
 * Unprepare a spell, keeping it known. Absent from the prepared list ->
 * unchanged. This function is pure.
 * @param {Character} character
 * @param {string} spellId
 * @returns {Character}
 */
export function unprepareSpell(character, spellId) {
  const book = getSpellbook(character);
  return {
    ...character,
    spellbook: { ...book, prepared: book.prepared.filter((id) => id !== spellId) },
  };
}
