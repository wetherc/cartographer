import { countNoun } from '../util/text.js';

/**
 * The pending levels as the banner and the Progression panel word them.
 * @param {number} n
 * @returns {string} "1 level to assign", "2 levels to assign"
 */
export const levelsToAssign = (n) => `${countNoun(n, 'level')} to assign`;

/**
 * @param {number} n
 * @returns {string} "1 improvement", "2 improvements"
 */
export const improvementCount = (n) => countNoun(n, 'improvement');

/**
 * @param {number} n
 * @returns {string} "1 feature choice", "2 feature choices"
 */
export const featureChoiceCount = (n) => countNoun(n, 'feature choice');

/**
 * The text of the level-up banner at the top of a character sheet. The
 * banner shows while a character has any level-up step left: a level earned
 * by XP and not yet assigned to a class, an ability score improvement, or a
 * class feature choice. It returns null when nothing is left, so the sheet
 * draws no banner.
 * @param {{ levels: number, improvements: number, choices: number }} counts
 * @returns {string | null}
 */
export function levelUpCue({ levels, improvements, choices }) {
  const parts = [
    levels > 0 && levelsToAssign(levels),
    improvements > 0 && improvementCount(improvements),
    choices > 0 && featureChoiceCount(choices),
  ].filter(Boolean);
  return parts.length === 0 ? null : `Ready to level up: ${parts.join(', ')}.`;
}

/**
 * The level on a roster row: the level the rules read, plus the levels
 * earned by XP and not yet assigned, in parentheses after the name. A Fighter 4
 * with XP for level 5 reads "(Lv 4, +1 to assign)", so the row does not claim a
 * level the rules ignore.
 * @param {number} level the effective level
 * @param {number} pending levels left to assign
 * @returns {string}
 */
export function rosterLevelText(level, pending) {
  return pending > 0 ? `(Lv ${level}, +${pending} to assign)` : `(Lv ${level})`;
}

/**
 * The level on the sheet header, in the same terms as `rosterLevelText`:
 * "Level 4, 1 level to assign".
 * @param {number} level the effective level
 * @param {number} pending levels left to assign
 * @returns {string}
 */
export function sheetLevelText(level, pending) {
  if (pending <= 0) return `Level ${level}`;
  return `Level ${level}, ${levelsToAssign(pending)}`;
}
