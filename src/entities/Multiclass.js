/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/class.js').ClassRef} ClassRef */

/**
 * Class-list mechanics: a character's classes are a list of `ClassRef`s whose
 * levels sum to at most the stored character level (the XP engine owns that
 * total). A shortfall is a pending level — earned by XP but not yet assigned
 * to a class — which is what the multiclass level-up flow spends. This module
 * is pure list arithmetic; it deliberately knows nothing about class
 * definitions (Classes.js reads them), so it can sit below every other entity
 * module without a cycle.
 */

/**
 * A character's classes. Older saves carried a scalar `class`/`subclass` pair
 * instead of a list; those read as a one-entry list at the character's full
 * level until `withDefaults` folds them in. A classless character yields an
 * empty list.
 * @param {Character} character
 * @returns {ClassRef[]}
 */
export function getClasses(character) {
  if (character.classes) return character.classes;
  const legacy = /** @type {{ class?: string, subclass?: string }} */ (
    /** @type {unknown} */ (character)
  );
  if (!legacy.class) return [];
  return [{ classId: legacy.class, level: totalLevel(character), subclass: legacy.subclass }];
}

/**
 * The character's first (primary) class, or null for a classless character.
 * The primary class anchors single-class behavior: its definition supplies the
 * hit die at level 1 and the full proficiency grant.
 * @param {Character} character
 * @returns {ClassRef | null}
 */
export function primaryClass(character) {
  return getClasses(character)[0] ?? null;
}

/**
 * The character's level in one class, 0 if they have no levels in it.
 * @param {Character} character
 * @param {string} classId
 * @returns {number}
 */
export function classLevelOf(character, classId) {
  return getClasses(character).find((ref) => ref.classId === classId)?.level ?? 0;
}

/** @param {Character} character @returns {number} the stored total, at least 1 */
function totalLevel(character) {
  return Math.max(1, Math.floor(character.level) || 1);
}

/**
 * The class levels the character has assigned, summed across the list.
 * @param {Character} character
 * @returns {number}
 */
export function assignedLevel(character) {
  return getClasses(character).reduce((sum, ref) => sum + Math.max(0, Math.floor(ref.level)), 0);
}

/**
 * Levels earned by XP but not yet assigned to a class: the stored character
 * level minus the class levels assigned. Always 0 for a classless character —
 * with no classes there is nothing to assign a level to.
 * @param {Character} character
 * @returns {number}
 */
export function pendingLevels(character) {
  if (getClasses(character).length === 0) return 0;
  return Math.max(0, totalLevel(character) - assignedLevel(character));
}

/**
 * Set the character's class list wholesale, sanitized: entries without a class
 * id drop out, levels floor to whole numbers of at least 1, and duplicate class
 * ids keep only their first entry. Pure.
 * @param {Character} character
 * @param {ClassRef[]} classes
 * @returns {Character}
 */
export function withClasses(character, classes) {
  /** @type {ClassRef[]} */
  const next = [];
  const seen = new Set();
  for (const ref of classes) {
    if (!ref.classId || seen.has(ref.classId)) continue;
    seen.add(ref.classId);
    next.push({ ...ref, level: Math.max(1, Math.floor(ref.level) || 1) });
  }
  return { ...character, classes: next };
}
