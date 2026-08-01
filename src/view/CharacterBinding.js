/**
 * Per-tab character binding for the Player view. A player tab can bind to
 * one party member. Only that character is playable from the tab: HP,
 * resources, conditions, inventory. Base attributes (stats, XP, roster
 * management) stay GM-only. An unbound player tab is a pure spectator.
 * There are two ways to bind, the same as PlayerLock: a `?character=<id>`
 * URL, which survives reloads and suits a bookmarked per-player display, or
 * an in-panel picker, which is per-tab through sessionStorage. The GM view
 * ignores bindings entirely.
 */

/** @typedef {import('../types/view.js').ViewRole} ViewRole */
/** @typedef {import('../types/view.js').SheetPermissions} SheetPermissions */
/** @typedef {import('../types/entities.js').Character} Character */

/** sessionStorage key holding this tab's bound character id. */
export const BOUND_CHARACTER_SESSION_KEY = 'campaign-builder:bound-character';

/**
 * localStorage key of a character's cross-tab claim lock. Bindings are
 * exclusive: one tab plays one character. The same heartbeat-lock machinery
 * as the GM lock enforces this (storage/GMLock.js, which takes the key as a
 * parameter). This function is pure.
 * @param {string} characterId
 * @returns {string}
 */
export function characterLockKey(characterId) {
  return `campaign-builder:character-lock:${characterId}`;
}

/**
 * The character id that a URL's query string requests, or null. This
 * function is pure.
 * @param {string} search A location.search string. The leading "?" is optional.
 * @returns {string | null}
 */
export function characterParam(search) {
  return new URLSearchParams(search).get('character');
}

/**
 * Resolve this tab's initial binding. The URL parameter wins over the
 * per-tab session value. An id that names no current party member (deleted,
 * misspelled, or from another campaign's save) resolves to unbound, instead
 * of dangling. This function is pure.
 * @param {string} search A location.search string.
 * @param {string | null} sessionValue The BOUND_CHARACTER_SESSION_KEY value.
 * @param {Character[]} characters
 * @returns {string | null}
 */
export function initialBinding(search, sessionValue, characters) {
  const requested = characterParam(search) ?? sessionValue;
  return requested !== null && characters.some((c) => c.id === requested) ? requested : null;
}

/**
 * What a viewer can do to a given character's sheet. The GM can do anything.
 * A player tab can play (spend pools, cast, set conditions, use inventory)
 * only the character it is bound to, and can never edit base attributes
 * (stats, XP, bonus HP, base AC).
 * The GM rules on HP. Damage and healing come through the GM's screen or
 * combat rolls, so even a bound player tab cannot change its own HP.
 * Recovery of spent pools follows the same rule: a player can spend a spell
 * slot or a ki point, but only the GM can put one back, so `restore` is
 * GM-only too.
 * This function is pure.
 * @param {ViewRole} role
 * @param {string | null} boundId This tab's bound character id.
 * @param {string} characterId The character being drawn.
 * @returns {SheetPermissions}
 */
export function partyPermissions(role, boundId, characterId) {
  if (role === 'gm') return { editBase: true, play: true, hp: true, restore: true };
  return {
    editBase: false,
    play: boundId !== null && boundId === characterId,
    hp: false,
    restore: false,
  };
}
