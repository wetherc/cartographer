import { clamp } from '../util/num.js';

/**
 * How far a cast grows past its base: the scaling steps of a cantrip or an
 * upcast, and the counts and dice that grow with them (projectiles, summoned
 * creatures, the target cap, and the damage parts). `Casting.castSpell`
 * reads these while it resolves a cast, and the cast form reads the target
 * cap and the steps. Every function here is pure.
 */

/** @typedef {import('../types/spell.js').Spell} Spell */
/** @typedef {import('../types/spell.js').SpellScaling} SpellScaling */
/** @typedef {import('../types/entities.js').DamagePart} DamagePart */
/** @typedef {import('./Casting.js').CastTarget} CastTarget */

/**
 * Cantrip damage scales with caster level, and it steps up at the 5e
 * breakpoints of level 5, level 11, and level 17. A level-1 cantrip's base
 * dice grow by one increment at level 5, two increments at level 11, and
 * three increments at level 17.
 * @param {number} casterLevel
 * @returns {number} how many `damagePerLevel` increments a cantrip adds
 */
export function cantripStep(casterLevel) {
  if (casterLevel >= 17) return 3;
  if (casterLevel >= 11) return 2;
  if (casterLevel >= 5) return 1;
  return 0;
}

/**
 * The number of scaling increments a cast applies. For a cantrip, this is the
 * caster's level step shown above. For a leveled spell, this is every slot
 * level above the spell's own level, which is upcasting. A spell with
 * `levelsPerStep` counts one increment per that many slot levels, rounded
 * down, so Spiritual Weapon gains 1d8 at 4th level and not at 3rd. This
 * function is exported because the cast dialog needs the same count to work
 * out how many targets to offer before the cast resolves.
 * @param {Spell} spell
 * @param {number} slotLevel
 * @param {number} casterLevel
 * @returns {number}
 */
export function scalingSteps(spell, slotLevel, casterLevel) {
  if (spell.level === 0) return cantripStep(casterLevel);
  const per = Math.max(1, spell.scaling?.levelsPerStep ?? 1);
  return Math.floor(Math.max(0, slotLevel - spell.level) / per);
}

/**
 * How many projectiles one cast fires: the effect's base `count`, plus
 * `perStep` more for each scaling increment. An effect with no `projectiles`
 * fires one attack, which is the single roll every other attack spell makes.
 * @param {import('../types/spell.js').SpellAttackEffect} effect
 * @param {number} steps how many scaling increments the cast applies
 * @returns {number}
 */
export function projectileCount(effect, steps) {
  const shots = effect.projectiles;
  if (!shots) return 1;
  return Math.max(1, shots.count + (shots.perStep ?? 0) * Math.max(0, steps));
}

/**
 * How many creatures one cast summons: the effect's base `count`, plus
 * `countPerStep` more for each scaling increment. A summons always brings at
 * least one creature, because a cast that spawns nothing is not a cast.
 * @param {import('../types/spell.js').SpellSummonsEffect} effect
 * @param {number} steps how many scaling increments the cast applies
 * @returns {number}
 */
export function summonCount(effect, steps) {
  return Math.max(1, effect.count + (effect.countPerStep ?? 0) * Math.max(0, steps));
}

/**
 * How many creatures one cast can resolve against: the spell's own
 * `targetCount`, with an absent value counted as 1, plus one more for each
 * scaling increment when the spell scales targets. A `targetCount` of 0
 * marks an area spell, where the number of creatures caught is a fact about
 * the map, not about the spell, so the cap is unbounded and the caster picks
 * the targets.
 *
 * A multi-projectile spell is capped by its projectiles instead, because
 * each projectile can pick its own creature and no creature can be picked
 * without one.
 * @param {Spell} spell
 * @param {number} steps how many scaling increments the cast applies
 * @returns {number} the cap, or Infinity for an area spell
 */
export function maxTargets(spell, steps) {
  const base = spell.targetCount ?? 1;
  if (base <= 0) return Infinity;
  if (spell.effect.kind === 'attack' && spell.effect.projectiles) {
    return projectileCount(spell.effect, steps);
  }
  return base + (spell.scaling?.targetsPerLevel ?? 0) * Math.max(0, steps);
}

/**
 * Split `count` projectiles between the targets. Use the caster's own
 * allocation when any target states one, clamped so the total never exceeds
 * what the spell fires. Otherwise spread the projectiles as evenly as
 * possible, with the earliest targets taking the remainder. This puts every
 * projectile on the one target of the common single-target cast.
 * @param {CastTarget[]} targets
 * @param {number} count
 * @returns {number[]} how many projectiles each target catches, in order
 */
export function allocateProjectiles(targets, count) {
  if (targets.length === 0) return [];
  if (!targets.some((t) => t.projectiles !== undefined)) {
    const each = Math.floor(count / targets.length);
    const extra = count % targets.length;
    return targets.map((_, i) => each + (i < extra ? 1 : 0));
  }
  let left = count;
  return targets.map((target) => {
    const wanted = Math.floor(Number(target.projectiles ?? 0));
    const given = Number.isFinite(wanted) ? clamp(wanted, 0, left) : 0;
    left -= given;
    return given;
  });
}

/**
 * A spell's base damage or healing dice, grown by its scaling: the base
 * parts, plus `damagePerLevel` appended once for each scaling increment.
 * This function returns fresh copies, so a later crit-doubling never mutates
 * the spell's stored dice.
 * @param {DamagePart[]} baseParts
 * @param {SpellScaling | undefined} scaling
 * @param {number} steps
 * @returns {DamagePart[]}
 */
export function scaledParts(baseParts, scaling, steps) {
  const parts = baseParts.map((p) => ({ ...p }));
  if (scaling?.damagePerLevel && steps > 0) {
    for (let i = 0; i < steps; i++) {
      for (const part of scaling.damagePerLevel) parts.push({ ...part });
    }
  }
  return parts;
}

/**
 * The dice that a spell's later-turn damage rolls, grown by its own per-step
 * dice, or null when the spell leaves no damage behind.
 * @param {import('../types/spell.js').SpellOngoing | undefined} ongoing
 * @param {number} steps
 * @returns {DamagePart[] | null}
 */
export function ongoingParts(ongoing, steps) {
  if (!ongoing || ongoing.damage.length === 0) return null;
  return scaledParts(ongoing.damage, { damagePerLevel: ongoing.perStep }, steps);
}
