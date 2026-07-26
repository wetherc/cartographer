import { getClass } from './Classes.js';
import { getClasses, pendingLevels, withClasses } from './Multiclass.js';
import { getProficiencies, withProficiencies } from './Proficiencies.js';
import { hpGainPerLevel, syncHitDice } from './HitDice.js';
import { syncSlotsToLevel } from './SpellSlots.js';
import { abilityModifier } from './Modifiers.js';
import { HP_RESOURCE_ID } from './Character.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/class.js').ClassDef} ClassDef */

/**
 * The multiclass level-up flow: a multiclass character's XP levels stay
 * pending (see Multiclass.js) until the player assigns each one to a class
 * here. Taking a class beyond the first is gated by the PHB ability-score
 * prerequisites — both the new class's and every current class's — and grants
 * that class's reduced multiclass proficiency list instead of the full one.
 * HP grows by the assigned class's average-rule gain at assignment time, which
 * is why addXP leaves a multiclass character's HP untouched.
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
    weapons: [...p.weapons, ...grant.weaponCategories, ...grant.weaponNamed],
    tools: [...p.tools, ...grant.tools],
  });
}

/** Adjust the HP pool's max and current by a delta (max at least 1).
 * @param {Character} character @param {number} delta @returns {Character} */
function growHP(character, delta) {
  if (delta === 0) return character;
  return {
    ...character,
    resources: character.resources.map((r) => {
      if (r.id !== HP_RESOURCE_ID) return r;
      const max = Math.max(1, r.max + delta);
      return { ...r, max, current: Math.max(0, Math.min(max, r.current + delta)) };
    }),
  };
}

/** @param {ClassDef} def @param {Character} character @returns {number} */
function hpGain(def, character) {
  return hpGainPerLevel(def.hitDie, abilityModifier(character.stats?.CON ?? 10));
}

/** @param {Character} character @returns {Character} */
function resync(character) {
  return syncHitDice(syncSlotsToLevel(character));
}

/**
 * Assign one level to a class. A pending level (earned by XP, unassigned)
 * either raises an existing class entry by one or, prerequisites permitting,
 * starts a new class at level 1 with its reduced multiclass proficiency grant.
 * A single-class character with no pending level can still start a second
 * class: their newest level moves out of the sole class into the new one (the
 * class must be at least level 2), adjusting HP by the difference in the two
 * classes' per-level gains. Either way HP grows by the assigned class's
 * average-rule gain and the hit-dice and spell-slot pools re-derive. An
 * unknown class, a failed prerequisite, or nothing to assign leaves the
 * character unchanged. Pure.
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
    return resync(growHP(withClasses(character, next), hpGain(def, character)));
  }

  if (!canMulticlass(character, classId)) return character;
  if (pending >= 1) {
    const next = withClasses(character, [...classes, { classId, level: 1 }]);
    return resync(growHP(grantMulticlassProficiencies(next, def), hpGain(def, character)));
  }

  if (classes.length !== 1 || classes[0].level < 2) return character;
  const donor = getClass(classes[0].classId);
  const next = withClasses(character, [
    { ...classes[0], level: classes[0].level - 1 },
    { classId, level: 1 },
  ]);
  const delta = hpGain(def, character) - (donor ? hpGain(donor, character) : 0);
  return resync(growHP(grantMulticlassProficiencies(next, def), delta));
}
