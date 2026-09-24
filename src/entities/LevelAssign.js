import { getClass, CLASS_LIST } from './Classes.js';
import { getClasses, pendingLevels, withClasses, classLevelOf } from './Multiclass.js';
import { getProficiencies, withProficiencies } from './Proficiencies.js';
import { applyFeatureGrant, derive } from './Progression.js';
import { withSubclass } from './Subclass.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/class.js').ClassDef} ClassDef */
/** @typedef {import('./FeatureGrants.js').FeatureStamp} FeatureStamp */

/**
 * The multiclass level-up flow. A multiclass character's XP levels stay
 * pending (see Multiclass.js) until the player assigns each one to a class
 * here. Taking a class beyond the first is gated by the PHB ability-score
 * prerequisites, both the new class's and every current class's. It grants
 * that class's reduced multiclass proficiency list instead of the full one.
 * HP follows the class list from `Progression.derive` at assignment time.
 * This is why addXP leaves a classed character's HP untouched.
 */

/**
 * Whether the character's ability scores meet a class's multiclass
 * prerequisite: any one alternative fully satisfied. A missing score reads
 * as the neutral 10. An unknown class never meets the prerequisite.
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
 * Whether the character can take `classId` as a new class. The class must
 * be known, not already held, and the ability-score prerequisites of both
 * the new class and every current (known) class must be met. The PHB gates
 * leaving a class the same way as entering one.
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

/**
 * Whether an ASI, feat, or class-feature record, or a chosen subclass,
 * claims a class level at or above `level`. The donor path moves a class's
 * newest level to a new class, and a record left on the moved level keeps
 * its increases and grants with no level to claim them. A subclass claims
 * the class's subclass level, because an Eldritch Knight moved below it
 * would keep its slots and spells with no casting to use them.
 * @param {Character} character
 * @param {string} classId
 * @param {number} level
 * @returns {boolean}
 */
export function hasChoiceAt(character, classId, level) {
  const records = [
    ...Object.values(character.asiChoices ?? {}),
    ...Object.values(character.featureChoices ?? {}),
  ];
  if (records.some((r) => r.classId === classId && r.classLevel >= level)) return true;
  const ref = getClasses(character).find((r) => r.classId === classId);
  return !!ref?.subclass && (getClass(classId)?.subclassLevel ?? 0) >= level;
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
 * either raises an existing class entry by one, or, if prerequisites allow
 * it, starts a new class at level 1 with its reduced multiclass proficiency
 * grant. A single-class character with no pending level can still start a
 * second class. Their newest level moves out of the sole class into the new
 * one (the class must be at least level 2). Either way, `derive` re-reads
 * the new class list, so HP, hit dice, and spell slots all follow it. This
 * includes the case where the moved level swaps a bigger hit die for a
 * smaller one, and HP decreases. An unknown class, a failed prerequisite,
 * a choice record on the level that would move (see {@link hasChoiceAt}), or
 * nothing to assign leaves the character unchanged. This function is
 * pure.
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
  if (hasChoiceAt(character, classes[0].classId, classes[0].level)) return character;
  const next = withClasses(character, [
    { ...classes[0], level: classes[0].level - 1 },
    { classId, level: 1 },
  ]);
  return derive(grantMulticlassProficiencies(next, def));
}

/**
 * Assign a level and apply the picks gathered for it, as one step. The
 * level-up dialogs gather their picks against a preview of the level. When
 * the last dialog closes, the sheet calls this on the character read at that
 * moment, so an HP change or a spent slot from another tab while a dialog
 * stood open is kept. `skills` are the multiclass skill picks, and they apply
 * only when the level starts a new class. `subclass`, when present, is the
 * subclass picked as the level reached the class's subclass level (see
 * `Subclass.withSubclass`). It applies before the feature stamps. A feature
 * stamp whose grant is not pending on the result does nothing. The
 * character comes back unchanged when the level itself cannot be assigned
 * any more. This function is pure.
 * @param {Character} character
 * @param {{ classId: string, skills: string[], stamps: FeatureStamp[], subclass?: string }} choices
 * @returns {Character}
 */
export function applyLevelChoices(character, { classId, skills, stamps, subclass }) {
  const isNew = classLevelOf(character, classId) === 0;
  let next = assignLevel(character, classId);
  if (next === character) return character;
  if (isNew && skills.length > 0) {
    const p = getProficiencies(next);
    next = derive(
      withProficiencies(next, { ...p, skills: [...new Set([...p.skills, ...skills])] }),
    );
  }
  if (subclass) next = withSubclass(next, classId, subclass);
  for (const stamp of stamps) next = applyFeatureGrant(next, stamp);
  return next;
}

/**
 * Whether reaching the class's next level asks for a subclass: the level
 * lands on the class's subclass level and the class has no subclass yet.
 * @param {Character} preview the character with the level applied
 * @param {string} classId
 * @returns {boolean}
 */
export function asksForSubclass(preview, classId) {
  const def = getClass(classId);
  const ref = getClasses(preview).find((r) => r.classId === classId);
  return !!def && !!ref && ref.level === def.subclassLevel && !ref.subclass;
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
 * The class picks that the assign-a-level dialog offers. With a pending
 * level, the picks are every held class one level up, plus every new class
 * the prerequisites allow. Without a pending level, the picks are only the
 * new classes that a single-class character of level 2 or more can move
 * their newest level into. This is `assignLevel`'s donor path.
 *
 * A new class whose prerequisites are not met is still listed, disabled,
 * and it names what it wants. The requirement quoted is the new class's own
 * requirement, or a held class's requirement when leaving that class blocks
 * the move. For example, a Fighter 3 whose STR and DEX both fell below 13
 * must see the Fighter requirement, not the Wizard requirement.
 *
 * The disabled entries sort after the usable ones, so the dialog's first
 * option always works when any option does.
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
    const donor = pending > 0 ? null : classes[0];
    // The donor level as "Fighter 4", set only when a choice record claims it.
    const claimed =
      donor && hasChoiceAt(character, donor.classId, donor.level)
        ? `${className(donor.classId)} ${donor.level}`
        : null;
    for (const def of CLASS_LIST) {
      if (classLevelOf(character, def.id) > 0) continue;
      if (claimed && canMulticlass(character, def.id)) {
        ineligible.push({
          value: def.id,
          label: `${def.name}: undo the ${claimed} choice first`,
          disabled: true,
        });
        continue;
      }
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
