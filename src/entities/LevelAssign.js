import { getClass, CLASS_LIST } from './Classes.js';
import { getClasses, pendingLevels, withClasses, classLevelOf } from './Multiclass.js';
import { getProficiencies, withProficiencies } from './Proficiencies.js';
import { derive } from './Progression.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/class.js').ClassDef} ClassDef */

/**
 * The multiclass level-up flow: a multiclass character's XP levels stay
 * pending (see Multiclass.js) until the player assigns each one to a class
 * here. Taking a class beyond the first is gated by the PHB ability-score
 * prerequisites — both the new class's and every current class's — and grants
 * that class's reduced multiclass proficiency list instead of the full one.
 * HP follows the class list from `Progression.derive` at assignment time,
 * which is why addXP leaves a classed character's HP untouched.
 */

/**
 * Whether the character's ability scores meet a class's multiclass
 * prerequisite: any one alternative fully satisfied. A missing score reads as
 * the neutral 10; an unknown class is never met.
 * @param {Character} character
 * @param {string} classId
 * @returns {boolean}
 */
export function meetsPrereq(character, classId) {
  const alternatives = getClass(classId)?.multiclassPrereq;
  if (!alternatives) return false;
  if (alternatives.length === 0) return true;
  return alternatives.some((minimums) =>
    Object.entries(minimums).every(([key, min]) => (character.stats?.[key] ?? 10) >= min),
  );
}

/**
 * Whether the character may take `classId` as a new class: the class must be
 * known, not already held, and the ability-score prerequisites of both the new
 * class and every current (known) class must be met — the PHB gates leaving a
 * class the same way as entering one.
 * @param {Character} character
 * @param {string} classId
 * @returns {boolean}
 */
export function canMulticlass(character, classId) {
  const classes = getClasses(character);
  if (!getClass(classId) || classes.some((ref) => ref.classId === classId)) return false;
  if (!meetsPrereq(character, classId)) return false;
  return classes.every((ref) => !getClass(ref.classId) || meetsPrereq(character, ref.classId));
}

/** @param {Character} character @param {ClassDef} def @returns {Character} */
function grantMulticlassProficiencies(character, def) {
  const grant = def.multiclassGrant;
  const p = getProficiencies(character);
  return withProficiencies(character, {
    ...p,
    armor: [...p.armor, ...grant.armor],
    weapons: {
      categories: [...p.weapons.categories, ...grant.weaponCategories],
      named: [...p.weapons.named, ...grant.weaponNamed],
    },
    tools: [...p.tools, ...grant.tools],
  });
}

/**
 * Assign one level to a class. A pending level (earned by XP, unassigned)
 * either raises an existing class entry by one or, prerequisites permitting,
 * starts a new class at level 1 with its reduced multiclass proficiency grant.
 * A single-class character with no pending level can still start a second
 * class: their newest level moves out of the sole class into the new one (the
 * class must be at least level 2). Either way `derive` re-reads the new class
 * list, so HP, hit dice, and spell slots all follow it — including the case
 * where the moved level swaps a bigger hit die for a smaller one and HP goes
 * down. An unknown class, a failed prerequisite, or nothing to assign leaves
 * the character unchanged. Pure.
 * @param {Character} character
 * @param {string} classId
 * @returns {Character}
 */
export function assignLevel(character, classId) {
  const def = getClass(classId);
  if (!def) return character;
  const classes = getClasses(character);
  const existing = classes.find((ref) => ref.classId === classId);
  const pending = pendingLevels(character);

  if (existing) {
    if (pending < 1) return character;
    const next = classes.map((ref) =>
      ref.classId === classId ? { ...ref, level: ref.level + 1 } : ref,
    );
    return derive(withClasses(character, next));
  }

  if (!canMulticlass(character, classId)) return character;
  if (pending >= 1) {
    const next = withClasses(character, [...classes, { classId, level: 1 }]);
    return derive(grantMulticlassProficiencies(next, def));
  }

  if (classes.length !== 1 || classes[0].level < 2) return character;
  const next = withClasses(character, [
    { ...classes[0], level: classes[0].level - 1 },
    { classId, level: 1 },
  ]);
  return derive(grantMulticlassProficiencies(next, def));
}

/**
 * A class's display name, falling back to its id so a save naming a class this
 * build does not have still reads as something.
 * @param {string} classId
 * @returns {string}
 */
export function className(classId) {
  return getClass(classId)?.name ?? classId;
}

/**
 * One class's multiclass prerequisite as text: each alternative's minimums
 * joined with "and", the alternatives with "or", so Fighter reads
 * "STR 13 or DEX 13".
 * @param {ClassDef} def
 * @returns {string}
 */
export function prereqText(def) {
  return def.multiclassPrereq
    .map((minimums) =>
      Object.entries(minimums)
        .map(([key, min]) => `${key} ${min}`)
        .join(' and '),
    )
    .join(' or ');
}

/**
 * The class picks the assign-a-level dialog offers. With a pending level that is
 * every held class one level up, plus every new class the prerequisites allow.
 * Without one it is only the new classes a single-class character of level 2 or
 * more can move their newest level into, which is `assignLevel`'s donor path.
 *
 * A new class whose prerequisites are not met is still listed, disabled, naming
 * what it wants. The requirement quoted is the new class's own, or a held
 * class's when leaving that class is what blocks the move, since a Fighter 3
 * whose STR and DEX both fell below 13 needs to be told about the Fighter
 * requirement rather than about Wizard's.
 *
 * The disabled entries sort after the usable ones, so the dialog's first option
 * is always one that works when any does.
 * @param {Character} character
 * @returns {{ value: string, label: string, disabled?: boolean }[]}
 */
export function assignOptions(character) {
  const classes = getClasses(character);
  const pending = pendingLevels(character);
  /** @type {{ value: string, label: string, disabled?: boolean }[]} */
  const options = [];
  /** @type {{ value: string, label: string, disabled?: boolean }[]} */
  const ineligible = [];
  if (pending > 0) {
    for (const ref of classes) {
      if (!getClass(ref.classId)) continue;
      options.push({
        value: ref.classId,
        label: `${className(ref.classId)}: level ${ref.level} -> ${ref.level + 1}`,
      });
    }
  }
  if (pending > 0 || (classes.length === 1 && classes[0].level >= 2)) {
    for (const def of CLASS_LIST) {
      if (classLevelOf(character, def.id) > 0) continue;
      if (canMulticlass(character, def.id)) {
        options.push({ value: def.id, label: `${def.name}: new class at level 1` });
        continue;
      }
      const blocker = !meetsPrereq(character, def.id)
        ? def
        : classes
            .map((ref) => getClass(ref.classId))
            .find((held) => held && !meetsPrereq(character, held.id));
      if (!blocker) continue;
      const via = blocker === def ? '' : ` (${blocker.name})`;
      ineligible.push({
        value: def.id,
        label: `${def.name}: requires ${prereqText(blocker)}${via}`,
        disabled: true,
      });
    }
  }
  return [...options, ...ineligible];
}
