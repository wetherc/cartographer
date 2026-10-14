/**
 * The "Playing as" picker of a Player tab. It binds the tab to one
 * character, or to none for a spectator tab. CSS hides it for the GM.
 * `view/CharacterClaim.js` decides what the picker shows and whether it
 * locks, and this file only draws that.
 */

import { el } from './dom.js';
import { select, setOptions } from './formFields.js';

/**
 * Mount the picker in `container`.
 * @param {HTMLElement} container
 * @param {(id: string | null) => void} onPick runs on a player's pick, with
 *   null for "Spectator"
 * @returns {import('../view/CharacterClaim.js').ClaimPicker}
 */
export function mountCharacterClaimPicker(container, onPick) {
  const picker = select([], '', { ariaLabel: 'Character this tab plays as' });
  container.appendChild(
    el(
      'label',
      'party-binding u-row u-g2',
      el('span', 'party-binding__label u-muted', 'Playing as'),
      picker,
    ),
  );
  picker.addEventListener('change', () => onPick(picker.value === '' ? null : picker.value));

  /** The options the picker shows now, as one comparable string. */
  /** @type {string | null} */
  let painted = null;

  return {
    setLocked(locked) {
      picker.disabled = locked;
    },
    paint(options, value) {
      // Every refresh of the party panels reaches this picker, and a
      // cross-tab adoption fires one every few seconds. Replacing the
      // options each time closes an open dropdown under the player's cursor.
      // The displayed value is part of the check, not only the binding
      // behind it. A pick that another tab already plays is refused, which
      // leaves the rejected name on screen with the binding unchanged, and
      // this call puts the bound name back.
      const stamp = JSON.stringify([value, options]);
      if (stamp === painted && picker.value === value) return;
      painted = stamp;
      setOptions(picker, options, value);
    },
  };
}
