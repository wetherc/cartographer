import { getClass, casterClassRefs } from './Classes.js';
import { casterDefFor, subclassDef } from './ClassCasting.js';
import { getClasses } from './Multiclass.js';
import { getSpellbook } from './Character.js';
import { derive } from './Progression.js';
import { spliceReservedPools } from './Resource.js';
import { isCasterPool } from './SpellSlots.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/entities.js').Spellbook} Spellbook */
/** @typedef {import('../types/class.js').ClassRef} ClassRef */

/**
 * Choosing a character's subclass. A subclass is a name on the class
 * membership. A catalog subclass with casting (the Eldritch Knight) turns
 * the class into a caster, so a change can add or remove spell slots and
 * spells. Every function is pure.
 */

/**
 * Whether the character can choose a subclass for one of its classes: it
 * holds the class at or above the class's subclass level.
 * @param {Character} character
 * @param {string} classId
 * @returns {boolean}
 */
export function canChooseSubclass(character, classId) {
  const def = getClass(classId);
  const ref = getClasses(character).find((r) => r.classId === classId);
  return !!def && !!ref && ref.level >= def.subclassLevel;
}

/**
 * The name to store for a subclass entry: the catalog name when the text
 * names a catalog subclass by id or by name in any case, else the trimmed
 * text. An empty result clears the subclass.
 * @param {string} classId
 * @param {string} text
 * @returns {string}
 */
export function subclassName(classId, text) {
  return subclassDef(classId, text)?.name ?? text.trim();
}

/**
 * Drop the spells recorded as learned under one class from a spellbook.
 * Spells with no recorded class stay.
 * @param {Spellbook} book
 * @param {string} classId
 * @returns {Spellbook}
 */
function withoutClassSpells(book, classId) {
  const sources = book.sources ?? {};
  const keep = (/** @type {string} */ id) => sources[id] !== classId;
  const kept = Object.fromEntries(Object.entries(sources).filter(([, c]) => c !== classId));
  return {
    cantrips: book.cantrips.filter(keep),
    known: book.known.filter(keep),
    prepared: book.prepared.filter(keep),
    ...(book.sources ? { sources: kept } : {}),
  };
}

/**
 * Set or clear the subclass of one of the character's classes. `text` is a
 * catalog subclass id or name, free text for a subclass outside the
 * catalog, or an empty string to clear it. When the change alters how the
 * class casts, the slots re-derive. A class that stops casting loses the
 * spells learned under it, and a character with no caster class left loses
 * its slot pools. The character comes back unchanged when it cannot choose a
 * subclass for the class yet (see `canChooseSubclass`), or when the stored
 * name would not change.
 * @param {Character} character
 * @param {string} classId
 * @param {string} text
 * @returns {Character}
 */
export function withSubclass(character, classId, text) {
  if (!canChooseSubclass(character, classId)) return character;
  const classes = getClasses(character);
  const ref = /** @type {ClassRef} */ (classes.find((r) => r.classId === classId));
  const name = subclassName(classId, text);
  if (name === (ref.subclass ?? '')) return character;
  const { subclass: _old, ...rest } = ref;
  const nextRef = name ? { ...rest, subclass: name } : rest;
  /** @type {Character} */
  let next = { ...character, classes: classes.map((r) => (r === ref ? nextRef : r)) };
  if (casterDefFor(nextRef) === casterDefFor(ref)) return next;
  if (casterDefFor(nextRef)?.casterType === 'none') {
    next = { ...next, spellbook: withoutClassSpells(getSpellbook(next), classId) };
  }
  if (casterClassRefs(next).length === 0) {
    next = { ...next, resources: spliceReservedPools(next.resources, [], isCasterPool) };
  }
  return derive(next);
}

/** The select value that stands for a subclass typed by hand. No catalog
 * subclass name can equal it. */
export const OTHER_SUBCLASS = '__other__';

/**
 * The picks the subclass dialog offers for a class: every catalog subclass
 * by name, a casting one marked "casts spells", then "Other", which asks for
 * a typed name. With `current` set, the list opens with "None" to clear it,
 * and a stored name outside the catalog is listed so the dialog can open on
 * it.
 * @param {string} classId
 * @param {string} [current]
 * @returns {{ value: string, label: string }[]}
 */
export function subclassChoices(classId, current) {
  const catalog = (getClass(classId)?.subclasses ?? []).map((s) => ({
    value: s.name,
    label: s.casting ? `${s.name} (casts spells)` : s.name,
  }));
  const custom =
    current && !subclassDef(classId, current) ? [{ value: current, label: current }] : [];
  return [
    ...(current ? [{ value: '', label: 'None' }] : []),
    ...catalog,
    ...custom,
    { value: OTHER_SUBCLASS, label: 'Other…' },
  ];
}

/**
 * The toast line after a subclass change, for example "Fighter: Eldritch
 * Knight. Learn its spells in the Spellbook tab." A casting subclass adds
 * the pointer to the Spellbook tab. A cleared subclass reads "Fighter: no
 * martial archetype."
 * @param {Character} character the character after the change
 * @param {string} classId
 * @returns {string}
 */
export function subclassNotice(character, classId) {
  const def = getClass(classId);
  const ref = getClasses(character).find((r) => r.classId === classId);
  const name = def?.name ?? classId;
  if (!ref?.subclass) {
    return `${name}: no ${(def?.subclassLabel ?? 'subclass').toLowerCase()}.`;
  }
  const casts = casterDefFor(ref) !== def;
  return `${name}: ${ref.subclass}.${casts ? ' Learn its spells in the Spellbook tab.' : ''}`;
}
