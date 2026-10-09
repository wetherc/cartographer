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
    levels > 0 && `${levels} level${levels === 1 ? '' : 's'} to assign`,
    improvements > 0 && `${improvements} improvement${improvements === 1 ? '' : 's'}`,
    choices > 0 && `${choices} feature choice${choices === 1 ? '' : 's'}`,
  ].filter(Boolean);
  return parts.length === 0 ? null : `Ready to level up: ${parts.join(', ')}.`;
}

/**
 * The level on a roster row: the level the rules read, plus the levels
 * earned by XP and not yet assigned. A Fighter 4 with XP for level 5 reads
 * "Lv 4 (+1 to assign)", so the row does not claim a level the rules ignore.
 * @param {number} level the effective level
 * @param {number} pending levels left to assign
 * @returns {string}
 */
export function rosterLevelText(level, pending) {
  return pending > 0 ? `Lv ${level} (+${pending} to assign)` : `Lv ${level}`;
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
  return `Level ${level}, ${pending} level${pending === 1 ? '' : 's'} to assign`;
}
