/**
 * The claiming half of the per-tab character binding: taking a character,
 * losing it to another tab, and the "Playing as" picker that the Player view
 * binds through. `CharacterBinding.js`, beside this file, holds the pure
 * rules: which id a URL and a session value resolve to, and what a bound
 * tab can touch. This file is the stateful driver over those rules, so a
 * tab's claim, its session record, and the picker that shows it can never
 * disagree.
 *
 * Bindings are exclusive across tabs. Claiming takes a heartbeat lock in
 * localStorage, the same machinery as the GM lock, so two player tabs can
 * never both play "Hero". A refused claim leaves the tab as a spectator,
 * with a toast that names who holds the character.
 */

import { createHeartbeatLock } from '../storage/GMLock.js';
import {
  BOUND_CHARACTER_SESSION_KEY,
  characterLockKey,
  initialBinding,
} from './CharacterBinding.js';
import { el } from '../ui/dom.js';
import { select, setOptions } from '../ui/formFields.js';

/** @typedef {import('../types/entities.js').Character} Character */

/**
 * Mount the picker, and resolve this tab's starting binding.
 *
 * The three callbacks keep this module out of the party panels. `bind` runs
 * when a pick takes effect, and must select that character. `spectate`
 * runs when the tab ends up with nothing (a cleared pick, a refused claim,
 * or a character taken over by another tab), and must redraw the panels
 * as read-only. `toast` reports the two cross-tab outcomes that a GM cannot
 * predict. These callbacks run later, not here, because the panels they
 * refresh mount after this function runs.
 * @param {{
 *   container: HTMLElement,
 *   getCharacters: () => Character[],
 *   bind: (id: string) => void,
 *   spectate: () => void,
 *   toast: (message: string) => void,
 * }} deps
 * @returns {{
 *   getBoundId: () => string | null,
 *   setBinding: (id: string | null) => string | null,
 *   updatePicker: () => void,
 * }}
 */
export function createCharacterClaim({ container, getCharacters, bind, spectate, toast }) {
  /** This tab's bound character, Player view only: the one character this
   * tab can play. Bound through ?character=<id> or the picker below. */
  /** @type {string | null} */
  let boundId = null;

  const name = (/** @type {string} */ id) => getCharacters().find((c) => c.id === id)?.name ?? id;

  // onYield covers the takeover case: this tab was frozen past the lock's
  // TTL, and another tab picked up its character.
  const lock = createHeartbeatLock({
    onYield: () => {
      const lost = name(boundId ?? '');
      boundId = null;
      sessionStorage.removeItem(BOUND_CHARACTER_SESSION_KEY);
      toast(`Another tab took over ${lost}; this tab is now a spectator.`);
      spectate();
    },
  });

  /**
   * Bind this tab to a character, or to null for spectator. This function
   * enforces the cross-tab claim, and returns the binding that took effect.
   * @param {string | null} id
   * @returns {string | null}
   */
  function setBinding(id) {
    if (id === boundId) return boundId;
    if (id === null) {
      lock.release();
    } else if (!lock.claim(characterLockKey(id))) {
      // The claim released the previous character's lock before it failed.
      // This tab now holds nothing, and falls back to spectator.
      toast(`Another tab is already playing ${name(id)}; this tab stays a spectator.`);
      id = null;
    }
    boundId = id;
    if (id) sessionStorage.setItem(BOUND_CHARACTER_SESSION_KEY, id);
    else sessionStorage.removeItem(BOUND_CHARACTER_SESSION_KEY);
    return id;
  }

  setBinding(
    initialBinding(
      location.search,
      sessionStorage.getItem(BOUND_CHARACTER_SESSION_KEY),
      getCharacters(),
    ),
  );

  // The picker, Player view only (CSS hides it for the GM): binds this tab
  // to one character, or to none for a spectator tab. The URL form
  // (?character=<id>) survives reloads. The picker is per-tab session state.
  const picker = select([], '', { ariaLabel: 'Character this tab plays as' });
  container.appendChild(
    el(
      'label',
      'party-binding u-row u-g2',
      el('span', 'party-binding__label u-muted', 'Playing as'),
      picker,
    ),
  );

  picker.addEventListener('change', () => {
    const took = setBinding(picker.value === '' ? null : picker.value);
    if (took) bind(took);
    else spectate();
  });

  /** The options the picker holds now, as one comparable string. */
  /** @type {string | null} */
  let painted = null;

  function updatePicker() {
    // A binding whose character left the roster resolves to spectator, with no message.
    if (boundId && !getCharacters().some((c) => c.id === boundId)) setBinding(null);
    const options = [
      { value: '', label: 'Spectator (view only)' },
      ...getCharacters().map((character) => ({ value: character.id, label: character.name })),
    ];
    // Every refresh of the party panels reaches this picker, and a cross-tab
    // adoption fires one every few seconds. Replacing the options each time
    // closes an open dropdown under the player's cursor.
    // The displayed value is part of the check, not only the binding behind
    // it. A pick that another tab already holds is refused, leaving the
    // rejected name on screen with the binding unchanged, and that has to be
    // put back.
    const stamp = JSON.stringify([boundId ?? '', options]);
    if (stamp === painted && picker.value === (boundId ?? '')) return;
    painted = stamp;
    setOptions(picker, options, boundId ?? '');
  }
  updatePicker();

  return { getBoundId: () => boundId, setBinding, updatePicker };
}
