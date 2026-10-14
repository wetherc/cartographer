/**
 * Exhaustion, in the 2014 form: a ladder of six levels, where each level
 * keeps the effects of the levels below it.
 *
 * | Level | Effect |
 * | --- | --- |
 * | 1 | Disadvantage on ability checks |
 * | 2 | Speed halved |
 * | 3 | Disadvantage on attack rolls and saving throws |
 * | 4 | Hit point maximum halved |
 * | 5 | Speed reduced to 0 |
 * | 6 | Death |
 *
 * The level is one stored number on the character or the creature. The
 * slants, the speed, and the readout all derive from it here. The halved HP
 * maximum is the one effect that has to be stored, because every HP reader
 * reads the stored maximum. `setExhaustion` moves the maximum when the level
 * crosses 4 and records the cut in `hpHalved`, the same way `hpBoost`
 * records the raise of Aid.
 *
 * A slant reaches a roll through `ConditionEffects.rollMode`, whose query
 * takes the level as `tired`. The modifier on the sheet does not change.
 *
 * This module imports only `PoolIds.js`, which imports nothing. `Checks.js`
 * reads it, and `Checks.js` is what `DeathSaves.js` is built on, so any
 * import of those from here would close a cycle. The two rules that need to
 * know about death, the guard that keeps a long rest from easing a dead
 * character and the revive that has to bring a level-6 character back below
 * six, therefore live with their callers.
 */

import { HP_RESOURCE_ID } from './PoolIds.js';

/** @typedef {import('../types/entities.js').Condition} Condition */

/**
 * Anything with an exhaustion level. Both `Character` and `Creature` have
 * one, and the HP fields of either.
 * @typedef {{
 *   exhaustion?: number,
 *   hpHalved?: number,
 *   maxHP?: number,
 *   currentHP?: number,
 *   resources?: { id: string, current: number, max: number }[],
 * }} Exhaustible
 */

/** The level that kills. There is no seventh. */
export const MAX_EXHAUSTION = 6;

/** The level from which ability checks roll at disadvantage. */
export const CHECKS_LEVEL = 1;

/** The level from which speed is halved. */
export const SLOW_LEVEL = 2;

/** The level from which attack rolls and saving throws roll at disadvantage. */
export const ROLLS_LEVEL = 3;

/** The level from which the HP maximum is halved. */
export const HALVED_HP_LEVEL = 4;

/** The level from which speed is 0. */
export const STILL_LEVEL = 5;

/**
 * What counts as a legacy exhaustion chip. A condition is a free string, so a
 * GM may have typed "Exhausted" or "Exhaustion 3" instead of the pick-list
 * name. The optional trailing number is the level the GM meant. Anything
 * longer, such as "Exhausting aura", is somebody's own chip and stays.
 */
const LEGACY_CHIP_PATTERN = /^exhaust(?:ion|ed)?(?:\s+(\d+))?$/i;

/**
 * The stored level, read tolerantly: a whole number from 0 to
 * {@link MAX_EXHAUSTION}. An absent, negative, fractional, or over-large value
 * comes back inside the range, so a hand-edited save cannot push a character
 * past death or below rest.
 * @param {Exhaustible} entity
 * @returns {number}
 */
export function exhaustionLevel(entity) {
  const stored = Math.floor(Number(entity.exhaustion));
  if (!Number.isFinite(stored) || stored < 0) return 0;
  return Math.min(stored, MAX_EXHAUSTION);
}

/**
 * The slant that exhaustion puts on one kind of d20 roll, or null. Level 1
 * gives disadvantage on ability checks, and level 3 gives it on attack rolls
 * and saving throws too. Initiative is a DEX check, so it rolls at
 * disadvantage from level 1.
 * @param {number} level
 * @param {'attack' | 'check' | 'save'} kind
 * @returns {'disadvantage' | null}
 */
export function exhaustionSlant(level, kind) {
  const from = kind === 'check' ? CHECKS_LEVEL : ROLLS_LEVEL;
  return level >= from ? 'disadvantage' : null;
}

/**
 * A walking speed after exhaustion: halved (rounded down) from level 2, and 0
 * from level 5.
 * @param {Exhaustible} entity
 * @param {number} speed the speed before exhaustion, in feet
 * @returns {number}
 */
export function tiredSpeed(entity, speed) {
  const level = exhaustionLevel(entity);
  if (level >= STILL_LEVEL) return 0;
  return level >= SLOW_LEVEL ? Math.floor(speed / 2) : speed;
}

/**
 * Whether this level of exhaustion is the fatal one. The death itself is not
 * written here. A character dies by its death-save tracker and a creature dies
 * at 0 HP, and neither of those is this module's to reach.
 * @param {Exhaustible} entity
 * @returns {boolean}
 */
export function atDeathLevel(entity) {
  return exhaustionLevel(entity) >= MAX_EXHAUSTION;
}

/**
 * An entity whose stored HP maximum matches its exhaustion level. From level
 * 4 the maximum is half the full maximum, rounded down, and `hpHalved`
 * records the cut. Current HP drops only where it sits above the new
 * maximum. Below level 4 the cut comes back onto the maximum, but current HP
 * stays where it is, because a higher maximum is not a heal. An entity that
 * already matches comes back as the same object.
 * @template {Exhaustible} T
 * @param {T} entity
 * @returns {T}
 */
export function settleExhaustionHP(entity) {
  const had = entity.hpHalved ?? 0;
  const pool = entity.resources?.find((r) => r.id === HP_RESOURCE_ID);
  const creature = typeof entity.maxHP === 'number' && typeof entity.currentHP === 'number';
  if (!creature && !pool) return entity;
  const full = (creature ? Number(entity.maxHP) : Number(pool?.max)) + had;
  const cut =
    exhaustionLevel(entity) >= HALVED_HP_LEVEL ? full - Math.max(1, Math.floor(full / 2)) : 0;
  if (cut === had) return entity;
  const max = full - cut;
  const { hpHalved: _had, ...rest } = entity;
  const recorded = /** @type {T} */ (cut > 0 ? { ...rest, hpHalved: cut } : rest);
  if (creature) {
    return { ...recorded, maxHP: max, currentHP: Math.min(Number(entity.currentHP), max) };
  }
  return {
    ...recorded,
    resources: entity.resources?.map((r) =>
      r.id === HP_RESOURCE_ID ? { ...r, max, current: Math.min(r.current, max) } : r,
    ),
  };
}

/**
 * Set the level outright, clamped, and move the HP maximum to match. This is
 * what the GM's stepper calls.
 * @template {Exhaustible} T
 * @param {T} entity
 * @param {number} level
 * @returns {T}
 */
export function setExhaustion(entity, level) {
  return settleExhaustionHP({ ...entity, exhaustion: exhaustionLevel({ exhaustion: level }) });
}

/**
 * Take levels off, clamped at zero. A long rest eases one level.
 *
 * There is no death guard here. A dead character must not ease back toward
 * life, but this module cannot read a death-save tracker without closing an
 * import cycle, so the caller holds that guard. `Character.longRest` is the
 * one caller that needs it, because the Time panel rests the whole party at
 * once and does not check who is still alive.
 * @template {Exhaustible} T
 * @param {T} entity
 * @param {number} [count]
 * @returns {T}
 */
export function easeExhaustion(entity, count = 1) {
  return setExhaustion(entity, exhaustionLevel(entity) - Math.max(0, Math.floor(count)));
}

/**
 * The effects of one level, as a phrase for the badge and the log, such as
 * "disadvantage on checks, attacks, and saves, half speed".
 * @param {number} level
 * @returns {string}
 */
export function levelEffects(level) {
  const rolls =
    level >= ROLLS_LEVEL ? 'disadvantage on checks, attacks, and saves' : 'disadvantage on checks';
  const parts = [rolls];
  if (level >= STILL_LEVEL) parts.push('speed 0');
  else if (level >= SLOW_LEVEL) parts.push('half speed');
  if (level >= HALVED_HP_LEVEL) parts.push('half HP maximum');
  return parts.join(', ');
}

/**
 * A sentence for the badge and the log, saying what the current level costs.
 * @param {Exhaustible} entity
 * @returns {string}
 */
export function exhaustionNote(entity) {
  const level = exhaustionLevel(entity);
  if (!level) return 'No exhaustion.';
  if (level >= MAX_EXHAUSTION) return `Exhaustion ${level}: dead.`;
  return `Exhaustion ${level}: ${levelEffects(level)}.`;
}

/**
 * The exhaustion half of a loaded character or creature, for the `withDefaults`
 * of each. It returns both fields it touches, because folding a legacy chip
 * changes the condition list as well as the level.
 *
 * A save written while exhaustion was a chip carried no level. A bare chip
 * reads as level 1, which is the least the GM can have meant by adding it, and
 * a chip with a number, such as "Exhaustion 3", reads as that level. Every
 * matching chip comes off, and where several disagree the highest wins. A save
 * that already stores a level keeps it and drops any stray chip beside it, so
 * the two can never disagree.
 * @param {number | undefined} stored the level as the save holds it
 * @param {Condition[]} conditions the condition list, already defaulted
 * @returns {{ exhaustion: number, conditions: Condition[] }}
 */
export function exhaustionFields(stored, conditions) {
  let chipped = false;
  let chipLevel = 0;
  for (const condition of conditions) {
    const match = LEGACY_CHIP_PATTERN.exec(condition.name.trim());
    if (!match) continue;
    chipped = true;
    chipLevel = Math.max(chipLevel, exhaustionLevel({ exhaustion: Number(match[1] ?? 1) }));
  }
  const level = exhaustionLevel({ exhaustion: stored });
  return {
    exhaustion: level || chipLevel,
    conditions: chipped
      ? conditions.filter((c) => !LEGACY_CHIP_PATTERN.test(c.name.trim()))
      : conditions,
  };
}
