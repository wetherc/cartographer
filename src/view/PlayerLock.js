/**
 * A tab locked to the Player view — for a shared table display that must not
 * flip to the GM's full truth on a stray tap. Two ways in: a `?role=player`
 * URL (survives reloads, ideal for a bookmarked display) or a confirm-gated
 * lock in the header (per-tab, via sessionStorage). Unlock by closing the tab
 * or removing the URL parameter; there is deliberately no in-app unlock.
 */

/** sessionStorage key marking this tab as locked to the Player view. */
export const PLAYER_LOCK_SESSION_KEY = 'campaign-builder:player-lock';

/**
 * The viewer role a URL's query string requests, or null. Only `player` is
 * honored — a URL cannot claim the GM view. Pure.
 * @param {string} search a location.search string (leading "?" optional)
 * @returns {'player' | null}
 */
export function roleParam(search) {
  const value = new URLSearchParams(search).get('role');
  return value && value.toLowerCase() === 'player' ? 'player' : null;
}

/**
 * Whether this tab is locked to the Player view, by URL or by the per-tab
 * session flag. Pure.
 * @param {string} search a location.search string
 * @param {string | null} sessionValue the PLAYER_LOCK_SESSION_KEY value
 * @returns {boolean}
 */
export function isPlayerLocked(search, sessionValue) {
  return roleParam(search) === 'player' || sessionValue != null;
}
