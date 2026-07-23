/**
 * Per-tab character binding for the Player view: a player tab can be bound to
 * one party member, and only that character is playable from the tab (HP,
 * resources, conditions, inventory). Base attributes (stats, XP, roster
 * management) stay GM-only, and an unbound player tab is a pure spectator.
 * Two ways to bind, mirroring PlayerLock: a `?character=<id>` URL (survives
 * reloads, ideal for a bookmarked per-player display) or an in-panel picker
 * (per-tab, via sessionStorage). The GM view ignores bindings entirely.
 */

/** @typedef {import('../types/view.js').ViewRole} ViewRole */
/** @typedef {import('../types/entities.js').Character} Character */

/** sessionStorage key holding this tab's bound character id. */
export const BOUND_CHARACTER_SESSION_KEY = 'campaign-builder:bound-character';

/**
 * localStorage key of a character's cross-tab claim lock. Bindings are
 * exclusive — one tab plays one character — enforced with the same
 * heartbeat-lock machinery as the GM lock (storage/GMLock.js, which takes the
 * key as a parameter). Pure.
 * @param {string} characterId
 * @returns {string}
 */
export function characterLockKey(characterId) {
  return `campaign-builder:character-lock:${characterId}`;
}

/**
 * The character id a URL's query string requests, or null. Pure.
 * @param {string} search a location.search string (leading "?" optional)
 * @returns {string | null}
 */
export function characterParam(search) {
  return new URLSearchParams(search).get('character');
}

/**
 * Resolve this tab's initial binding: the URL parameter wins over the per-tab
 * session value, and an id that names no current party member (deleted, typo,
 * another campaign's save) resolves to unbound rather than dangling. Pure.
 * @param {string} search a location.search string
 * @param {string | null} sessionValue the BOUND_CHARACTER_SESSION_KEY value
 * @param {Character[]} characters
 * @returns {string | null}
 */
export function initialBinding(search, sessionValue, characters) {
  const requested = characterParam(search) ?? sessionValue;
  return requested !== null && characters.some((c) => c.id === requested) ? requested : null;
}

/**
 * What a viewer may do to a given character's sheet. The GM may do anything;
 * a player tab may play (spend/restore pools, conditions, inventory) only the
 * character it is bound to, and may edit base attributes (stats, XP) never.
 * Pure.
 * @param {ViewRole} role
 * @param {string | null} boundId this tab's bound character id
 * @param {string} characterId the character being rendered
 * @returns {{ editBase: boolean, play: boolean }}
 */
export function partyPermissions(role, boundId, characterId) {
  if (role === 'gm') return { editBase: true, play: true };
  return { editBase: false, play: boundId !== null && boundId === characterId };
}
