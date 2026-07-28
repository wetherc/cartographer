/**
 * The claiming half of the per-tab character binding: taking a character,
 * losing it to another tab, and the "Playing as" picker the Player view binds
 * through. `CharacterBinding.js` beside this holds the pure rules — which id a
 * URL and a session value resolve to, and what a bound tab may touch — and this
 * is the stateful driver over them, so a tab's claim, its session record, and
 * the picker showing it can never disagree.
 *
 * Bindings are exclusive across tabs: claiming takes a heartbeat lock in
 * localStorage, the same machinery as the GM lock, so two player tabs can never
 * both play "Hero". A refused claim leaves the tab a spectator with a toast
 * naming who holds the character.
 */

import { createHeartbeatLock } from '../storage/GMLock.js';
import {
  BOUND_CHARACTER_SESSION_KEY,
  characterLockKey,
  initialBinding,
} from './CharacterBinding.js';

/** @typedef {import('../types/entities.js').Character} Character */

/**
 * Mount the picker and resolve this tab's starting binding.
 *
 * The three callbacks are what keeps this module out of the party panels: `bind`
 * runs when a pick takes effect and should select that character, `spectate`
 * runs when the tab ends up with nothing (a cleared pick, a refused claim, or a
 * character taken over by another tab) and should re-render the panels as
 * read-only, and `toast` reports the two cross-tab outcomes a GM cannot see
 * coming. They are called back rather than resolved here because the panels they
 * refresh are mounted after this.
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
  /** This tab's bound character (Player view only): the one character this tab
   * may play. Bound via ?character=<id> or the picker below. */
  /** @type {string | null} */
  let boundId = null;

  const name = (/** @type {string} */ id) => getCharacters().find((c) => c.id === id)?.name ?? id;

  // onYield covers the takeover case, where this tab was frozen past the lock's
  // TTL and another tab picked its character up.
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
   * Bind this tab to a character (or null for spectator), enforcing the
   * cross-tab claim. Returns the binding that actually took effect.
   * @param {string | null} id
   * @returns {string | null}
   */
  function setBinding(id) {
    if (id === boundId) return boundId;
    if (id === null) {
      lock.release();
    } else if (!lock.claim(characterLockKey(id))) {
      // The claim released the previous character's lock before it failed, so
      // this tab now holds nothing and falls back to spectator.
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

  // The picker, Player view only (hidden for the GM via CSS): binds this tab to
  // one character, or to none for a spectator tab. The URL form (?character=<id>)
  // survives reloads; the picker is per-tab session state.
  const field = document.createElement('label');
  field.className = 'party-binding';
  const caption = document.createElement('span');
  caption.className = 'party-binding__label';
  caption.textContent = 'Playing as';
  const picker = document.createElement('select');
  picker.className = 'field';
  picker.setAttribute('aria-label', 'Character this tab plays as');
  field.append(caption, picker);
  container.appendChild(field);

  picker.addEventListener('change', () => {
    const took = setBinding(picker.value === '' ? null : picker.value);
    if (took) bind(took);
    else spectate();
  });

  function updatePicker() {
    // A binding whose character left the roster silently resolves to spectator.
    if (boundId && !getCharacters().some((c) => c.id === boundId)) setBinding(null);
    picker.innerHTML = '';
    const spectator = document.createElement('option');
    spectator.value = '';
    spectator.textContent = 'Spectator (view only)';
    picker.appendChild(spectator);
    for (const character of getCharacters()) {
      const option = document.createElement('option');
      option.value = character.id;
      option.textContent = character.name;
      picker.appendChild(option);
    }
    picker.value = boundId ?? '';
  }
  updatePicker();

  return { getBoundId: () => boundId, setBinding, updatePicker };
}
