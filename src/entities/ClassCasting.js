import { DEFAULT_CLASSES } from '../data/classes.js';

/** @typedef {import('../types/class.js').ClassDef} ClassDef */
/** @typedef {import('../types/class.js').SubclassDef} SubclassDef */
/** @typedef {import('../types/class.js').CasterType} CasterType */
/** @typedef {{ classId: string, level?: number, subclass?: unknown }} CasterRef */

/**
 * The caster fields of one class membership, with its subclass applied. Most
 * classes cast (or not) by class alone. A subclass such as the Eldritch
 * Knight adds casting to a non-caster class, so every reader of caster
 * fields asks this module about the whole class reference, not the class id.
 *
 * This module imports only the class data. SpellSlots.js cannot import
 * Classes.js, because Classes.js imports SpellSlots.js, and both of them
 * read caster fields through this module.
 *
 * Every function is pure.
 */

/** @type {Map<string, ClassDef>} */
const CLASS_BY_ID = new Map(DEFAULT_CLASSES.map((c) => [c.id, c]));

/** @param {string} text @returns {string} */
function normalize(text) {
  return text.trim().toLowerCase();
}

/**
 * The catalog subclass that a stored subclass value names, matched by id or
 * by name without case. Null for an unknown class, a free-text subclass, or
 * a value that is not a string (a hand-edited save).
 * @param {string | undefined | null} classId
 * @param {unknown} subclass
 * @returns {SubclassDef | null}
 */
export function subclassDef(classId, subclass) {
  if (typeof subclass !== 'string' || !classId) return null;
  const key = normalize(subclass);
  if (!key) return null;
  const list = CLASS_BY_ID.get(classId)?.subclasses ?? [];
  return list.find((s) => s.id === key || normalize(s.name) === key) ?? null;
}

/** Merged class-plus-subclass definitions, one per class and subclass id, so
 * the same membership always resolves to the same object.
 * @type {Map<string, ClassDef>} */
const MERGED = new Map();

/**
 * The class definition that governs a class membership's spellcasting. It is
 * the class's own definition, or a merge with the subclass's casting fields
 * once the membership reaches the class's `subclassLevel`. A Fighter 2 with
 * an Eldritch Knight subclass on record (after a level moved to another
 * class) casts nothing. The result is null for an unknown class.
 * @param {CasterRef} ref
 * @returns {ClassDef | null}
 */
export function casterDefFor(ref) {
  const def = CLASS_BY_ID.get(ref.classId);
  if (!def) return null;
  const sub = subclassDef(ref.classId, ref.subclass);
  if (!sub?.casting || (ref.level ?? 1) < def.subclassLevel) return def;
  const key = `${def.id} ${sub.id}`;
  let merged = MERGED.get(key);
  if (!merged) {
    merged = Object.freeze({ ...def, ...sub.casting });
    MERGED.set(key, merged);
  }
  return merged;
}

/**
 * The caster type of a class membership. 'none' for an unknown class.
 * @param {CasterRef} ref
 * @returns {CasterType}
 */
export function casterTypeOf(ref) {
  return casterDefFor(ref)?.casterType ?? 'none';
}

/**
 * Whether a class membership casts spells.
 * @param {CasterRef} ref
 * @returns {boolean}
 */
export function isCasterRef(ref) {
  return casterTypeOf(ref) !== 'none';
}

/**
 * The spell-list id a class membership learns from. An Eldritch Knight
 * learns from the wizard list. A class without a `spellListId` uses its own
 * id.
 * @param {CasterRef} ref
 * @returns {string}
 */
export function spellListOf(ref) {
  return casterDefFor(ref)?.spellListId ?? ref.classId;
}

/**
 * The name to show for a caster membership: the casting subclass's name
 * ("Eldritch Knight") where one applies, else the class name, else the id.
 * @param {CasterRef} ref
 * @returns {string}
 */
export function casterName(ref) {
  const def = CLASS_BY_ID.get(ref.classId);
  if (!def) return ref.classId;
  const sub = subclassDef(ref.classId, ref.subclass);
  return sub?.casting && casterDefFor(ref) !== def ? sub.name : def.name;
}

/**
 * Whether a scalar class and subclass pair casts at a caster level. A
 * creature stores its class this way. Its Eldritch Knight subclass casts
 * only from fighter level 3, so the level decides.
 * @param {string | undefined | null} classId
 * @param {unknown} subclass
 * @param {number} level
 * @returns {boolean}
 */
export function castsAs(classId, subclass, level) {
  return !!classId && isCasterRef({ classId, subclass, level });
}
