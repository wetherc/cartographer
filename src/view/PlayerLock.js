/**
 * A tab locked to the Player view. This suits a shared table display that
 * must not flip to the GM's full truth on a stray tap. There are two ways
 * in: a `?role=player` URL, which survives reloads and suits a bookmarked
 * display, or a confirm-gated lock in the header, which is per-tab through
 * sessionStorage. Unlock the tab by closing it or by removing the URL
 * parameter. The app has no in-app unlock, by design.
 */

/** sessionStorage key that marks this tab as locked to the Player view. */
export const PLAYER_LOCK_SESSION_KEY = 'campaign-builder:player-lock';

/**
 * The viewer role that a URL's query string requests, or null. Only
 * `player` is honored. A URL cannot claim the GM view. This function is
 * pure.
 * @param {string} search A location.search string. The leading "?" is optional.
 * @returns {'player' | null}
 */
export function roleParam(search) {
  const value = new URLSearchParams(search).get('role');
  return value && value.toLowerCase() === 'player' ? 'player' : null;
}

/**
 * Whether this tab is locked to the Player view, by URL or by the per-tab
 * session flag. This function is pure.
 * @param {string} search A location.search string.
 * @param {string | null} sessionValue The PLAYER_LOCK_SESSION_KEY value.
 * @returns {boolean}
 */
export function isPlayerLocked(search, sessionValue) {
  return roleParam(search) === 'player' || sessionValue != null;
}
