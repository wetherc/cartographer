/** @typedef {'system' | 'light' | 'dark'} ThemePreference */

/** The localStorage key the theme preference persists under (shared with the
 * pre-paint inline script in index.html, which reads it before the app boots). */
export const THEME_STORAGE_KEY = 'campaign-builder:theme';

/** The switch's options in display order: follow the OS, pin light, pin dark.
 * @type {ThemePreference[]} */
export const THEMES = ['system', 'light', 'dark'];

/**
 * Coerce a stored value (possibly stale or hand-edited) to a valid preference.
 * @param {string | null | undefined} value
 * @returns {ThemePreference}
 */
export function normalizeTheme(value) {
  return value === 'light' || value === 'dark' ? value : 'system';
}

/**
 * Human label for the preference, used on the switch buttons' tooltips.
 * @param {ThemePreference} theme
 * @returns {string}
 */
export function themeLabel(theme) {
  return theme === 'system' ? 'System' : theme === 'light' ? 'Light' : 'Dark';
}
