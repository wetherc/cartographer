/**
 * Ability score modifiers and tiered default enemy stat blocks. Every
 * function is pure.
 */

/** @typedef {import('../types/entities.js').EnemyTier} EnemyTier */

/** The tiers an enemy can be authored at. Legends run above the normal stats for their level. */
export const ENEMY_TIERS = /** @type {EnemyTier[]} */ (['mob', 'legend']);

/** The six ability scores every creature carries, in conventional order.
 * Character.js re-exports this so character code keeps its natural import. */
export const ABILITY_SCORES = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];

/** The only stats an enemy carries: the six ability scores plus armor class.
 * Stat blocks are closed over this set. No custom stats exist. */
export const STAT_KEYS = [...ABILITY_SCORES, 'AC'];

/**
 * Close a stat block over STAT_KEYS. The function drops unknown stats, for
 * example a "Speed" value from an older save. It fills in missing stats:
 * ability scores default to 10, and AC derives from the block's DEX as 10
 * plus its modifier.
 * @param {Record<string, number>} block
 * @returns {Record<string, number>}
 */
export function normalizeStatBlock(block) {
  /** @type {Record<string, number>} */
  const next = {};
  for (const key of STAT_KEYS) {
    if (key === 'AC') {
      // Derive from the input DEX, not the output under construction.
      // Reading `next` here works only while AC stays last in STAT_KEYS.
      // If that order changes, this silently derives from a DEX of 10 instead.
      next.AC = block.AC ?? 10 + abilityModifier(block.DEX ?? 10);
    } else {
      next[key] = block[key] ?? 10;
    }
  }
  return next;
}

/**
 * The standard derived modifier. A score of 10 or 11 gives +0. Every two
 * points change the modifier by one step. For example, a DEX of 20 gives
 * +5, and a STR of 7 gives -2.
 * @param {number} score
 * @returns {number}
 */
export function abilityModifier(score) {
  return Math.floor((score - 10) / 2);
}

/**
 * The 5e proficiency bonus for a character level. The bonus is +2 at levels
 * 1-4, and it steps up by one every four levels (+3 at 5, +4 at 9, +5 at
 * 13, +6 at 17 and higher).
 * @param {number} level
 * @returns {number}
 */
export function proficiencyBonus(level) {
  return 2 + Math.floor((Math.max(1, Math.floor(level) || 1) - 1) / 4);
}

/**
 * The proficiency bonus a creature of a challenge rating rolls with. The
 * rating ladder and the character level ladder take the same steps: +2 up to
 * 4, then one more step every four ratings. Every rating below 1 rolls with
 * +2, the same as a first-level character. This function is therefore the
 * level rule read at the rating, and not a second copy of it.
 * @param {number} cr a challenge rating (see `data/challenge.js`)
 * @returns {number}
 */
export function crProficiencyBonus(cr) {
  return proficiencyBonus(Math.max(1, cr));
}

/**
 * Format a modifier with its sign, as character sheets conventionally do.
 * @param {number} modifier
 * @returns {string}
 */
export function formatModifier(modifier) {
  return modifier >= 0 ? `+${modifier}` : String(modifier);
}

/**
 * A default stat block for an enemy of a given level. The block holds the
 * six ability scores plus AC (10 plus the block's DEX modifier).
 *
 * Mob stats stay near the baseline and rise slowly with level. Physical
 * scores lead, and mental scores trail by two, up to a cap of 18. Legend
 * stats start well above normal and rise twice as fast, up to a cap of 26.
 * A level-matched legend always beats a mob's stats. Every score stays
 * editable after creation.
 * @param {number} level
 * @param {EnemyTier} tier
 * @returns {Record<string, number>}
 */
export function defaultEnemyStats(level, tier) {
  const lvl = Math.max(1, Math.floor(level) || 1);
  if (tier === 'legend') {
    const score = Math.min(26, 14 + Math.floor(lvl / 2));
    return normalizeStatBlock({
      STR: score,
      DEX: score,
      CON: score,
      INT: score,
      WIS: score,
      CHA: score,
    });
  }
  const physical = Math.min(18, 10 + Math.floor(lvl / 3));
  const mental = physical - 2;
  return normalizeStatBlock({
    STR: physical,
    DEX: physical,
    CON: physical,
    INT: mental,
    WIS: mental,
    CHA: mental,
  });
}
