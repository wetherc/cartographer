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
