/**
 * The 5e experience ladder. A character's `xp` is the total XP earned, and
 * the SRD table below gives the total at which each level starts. The CR XP
 * values and the encounter thresholds in `EncounterDifficulty.js` are SRD
 * values too, so an encounter budget and the level it pays for use the same
 * scale.
 */

/** The highest level a character reaches. */
export const MAX_LEVEL = 20;

/**
 * The total XP at which each level starts. Index 0 is level 1.
 * @type {readonly number[]}
 */
export const XP_THRESHOLDS = Object.freeze([
  0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000,
  195000, 225000, 265000, 305000, 355000,
]);

/**
 * The total XP at which a level starts. A level outside 1 to MAX_LEVEL
 * reads as the nearest end of the table.
 * @param {number} level
 * @returns {number}
 */
export function xpForLevel(level) {
  const index = Math.min(MAX_LEVEL, Math.max(1, Math.floor(level) || 1)) - 1;
  return XP_THRESHOLDS[index];
}

/**
 * The level that a total XP reaches, from 1 to MAX_LEVEL.
 * @param {number} xp
 * @returns {number}
 */
export function levelForXp(xp) {
  let level = 1;
  while (level < MAX_LEVEL && xp >= XP_THRESHOLDS[level]) level += 1;
  return level;
}

/**
 * The total XP at which the next level starts, or null at MAX_LEVEL.
 * @param {number} level
 * @returns {number | null}
 */
export function xpForNextLevel(level) {
  return level >= MAX_LEVEL ? null : xpForLevel(level + 1);
}
