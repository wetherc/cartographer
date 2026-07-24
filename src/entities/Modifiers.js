/**
 * Ability-score modifiers and tiered default enemy stat blocks. Pure.
 */

/** @typedef {import('../types/entities.js').EnemyTier} EnemyTier */

/** The tiers an enemy can be authored at; legends run above-normal for their level. */
export const ENEMY_TIERS = /** @type {EnemyTier[]} */ (['mob', 'legend']);

/** The only stats an enemy carries: the six ability scores plus armor class.
 * Stat blocks are closed over this set — there are no custom stats. */
export const STAT_KEYS = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA', 'AC'];

/**
 * Close a stat block over STAT_KEYS: unknown stats (e.g. a "Speed" from an
 * older save) are dropped, and missing ones are filled in — ability scores at
 * the 10 baseline, AC derived from the block's DEX as 10 + its modifier.
 * @param {Record<string, number>} block
 * @returns {Record<string, number>}
 */
export function normalizeStatBlock(block) {
  /** @type {Record<string, number>} */
  const next = {};
  for (const key of STAT_KEYS) {
    if (key === 'AC') {
      next.AC = block.AC ?? 10 + abilityModifier(next.DEX ?? 10);
    } else {
      next[key] = block[key] ?? 10;
    }
  }
  return next;
}

/**
 * The standard derived modifier: 10-11 is +0, every two points is one step,
 * so a DEX of 20 gives +5 and a STR of 7 gives -2.
 * @param {number} score
 * @returns {number}
 */
export function abilityModifier(score) {
  return Math.floor((score - 10) / 2);
}

/**
 * Render a modifier with its sign, as character sheets conventionally do.
 * @param {number} modifier
 * @returns {string}
 */
export function formatModifier(modifier) {
  return modifier >= 0 ? `+${modifier}` : String(modifier);
}

/**
 * A reasonable default stat block for an enemy of a given level: the six
 * ability scores plus AC (10 + the block's DEX modifier). Mobs sit near the
 * baseline and creep up slowly with level (physical scores lead, mental ones
 * trail by two), capping at 18. Legends start clearly above normal and scale
 * twice as fast, capping at 26 — a level-matched legend always out-stats a
 * mob. Every score stays editable after creation.
 * @param {number} level
 * @param {EnemyTier} tier
 * @returns {Record<string, number>}
 */
export function defaultEnemyStats(level, tier) {
  const lvl = Math.max(1, Math.floor(level) || 1);
  if (tier === 'legend') {
    const score = Math.min(26, 14 + Math.floor(lvl / 2));
    return normalizeStatBlock({ STR: score, DEX: score, CON: score, INT: score, WIS: score, CHA: score });
  }
  const physical = Math.min(18, 10 + Math.floor(lvl / 3));
  const mental = physical - 2;
  return normalizeStatBlock({ STR: physical, DEX: physical, CON: physical, INT: mental, WIS: mental, CHA: mental });
}
