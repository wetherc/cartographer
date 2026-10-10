import { DEFAULT_CLASSES } from '../data/classCatalog.js';
import { getClasses } from './Multiclass.js';
import { subclassDef } from './ClassCasting.js';
import { memoizeByIdentity } from '../util/memoize.js';

/** @typedef {import('../types/class.js').AbilityRaise} AbilityRaise */

/**
 * The ability raises of a combatant's unlocked class features, such as the
 * +4 STR and CON of the Barbarian's Primal Champion. A raise is derived on
 * read, so a level taken away removes it with no undo record.
 *
 * `Equipment.effectiveStats` applies the raises, and `Equipment.js` sits
 * below `LevelUp.js` in the import graph. This module therefore reads the
 * catalog directly instead of through `LevelUp.unlockedFeatures`, which
 * would close an import cycle through `Classes.js`.
 */

const CLASS_BY_ID = new Map(DEFAULT_CLASSES.map((def) => [def.id, def]));

/**
 * Every ability raise the class levels unlock, in class-list order.
 * @param {{ classes?: import('../types/class.js').ClassRef[], class?: string, level?: number }} combatant
 * @returns {AbilityRaise[]}
 */
export const abilityRaises = memoizeByIdentity((combatant) => {
  /** @type {AbilityRaise[]} */
  const raises = [];
  const refs = getClasses(/** @type {import('../types/entities.js').Character} */ (combatant));
  for (const ref of refs) {
    const def = CLASS_BY_ID.get(ref.classId);
    if (!def) continue;
    const level = Math.max(1, Math.floor(ref.level) || 1);
    const sub = subclassDef(ref.classId, ref.subclass)?.features ?? {};
    for (const [at, list] of [...Object.entries(def.featuresByLevel), ...Object.entries(sub)]) {
      if (Number(at) > level) continue;
      for (const entry of list) {
        if (typeof entry === 'string') continue;
        for (const effect of entry.effects ?? []) {
          if (effect.kind === 'abilityRaise') raises.push(effect);
        }
      }
    }
  }
  return raises;
});

/**
 * The scores with each raise applied. A raise adds its amount to each named
 * ability, but not past its cap, and it never lowers a score that already
 * sits above the cap.
 * @param {Record<string, number>} stats
 * @param {AbilityRaise[]} raises
 * @returns {Record<string, number>}
 */
export function applyRaises(stats, raises) {
  const next = { ...stats };
  for (const { abilities, amount, cap } of raises) {
    for (const ability of abilities) {
      const score = next[ability] ?? 10;
      next[ability] = Math.max(score, Math.min(score + amount, cap));
    }
  }
  return next;
}
