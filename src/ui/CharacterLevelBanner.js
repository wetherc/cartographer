import { assignLevelFlow } from './LevelAssignFlow.js';
import { pendingLevels } from '../entities/Multiclass.js';
import { pendingASISlots } from '../entities/LevelUp.js';
import { pendingFeatureGrants } from '../entities/FeatureGrants.js';
import { levelUpCue } from '../view/LevelUpCue.js';
import { textButton } from './buttons.js';
import { el } from './dom.js';

/** @typedef {import('../types/entities.js').Character} Character */

/**
 * The level-up line for a character, or null when no level-up step waits.
 * The party roster uses it to mark a row as well.
 * @param {Character} character
 * @returns {string | null}
 */
export function levelUpText(character) {
  return levelUpCue({
    levels: pendingLevels(character),
    improvements: pendingASISlots(character).length,
    choices: pendingFeatureGrants(character).length,
  });
}

/**
 * The banner at the top of a character sheet while a level-up step waits.
 * A viewer who can edit the character gets a Level up button. It opens the
 * class assignment for a pending level. Otherwise it moves focus to the
 * improvement or feature choice in the progression section, which
 * `getProgress` returns. With `openFull`, the button first opens the full
 * sheet, which shows the progression section. A viewer who cannot edit the
 * character reads the banner only. It returns null when no step waits.
 * @param {Character} character
 * @param {{
 *   editBase: boolean,
 *   live: () => Character,
 *   onCommit: (character: Character) => void,
 *   notify: (message: string) => void,
 *   getProgress: () => HTMLElement | null,
 *   openFull?: (() => void) | null,
 * }} opts
 * @returns {HTMLElement | null}
 */
export function levelUpBanner(character, opts) {
  const levels = pendingLevels(character);
  const text = levelUpText(character);
  if (!text) return null;
  const banner = el(
    'div',
    'character-sheet__level-up u-row u-g2',
    el('span', 'character-sheet__level-up-text', text),
  );
  banner.setAttribute('role', 'status');
  if (!opts.editBase) return banner;
  const onClick = () => {
    opts.openFull?.();
    if (levels > 0) {
      assignLevelFlow(opts.live, opts);
      return;
    }
    const progress = opts.getProgress();
    progress?.scrollIntoView({ block: 'nearest' });
    // The improvement and feature-choice buttons sit after the subclass and
    // "Add a class" buttons, so the banner looks for its own mark.
    /** @type {HTMLButtonElement | null | undefined} */ (
      progress?.querySelector('button[data-pending]')
    )?.focus();
  };
  banner.appendChild(
    textButton('Level up', onClick, {
      variant: 'primary',
      ariaLabel: `Level up ${character.name}`,
    }),
  );
  return banner;
}
