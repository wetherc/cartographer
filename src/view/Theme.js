/** @typedef {'system' | 'light' | 'dark'} ThemePreference */

/** The localStorage key that stores the theme preference. The pre-paint
 * inline script in index.html shares this key, and reads it before the app
 * starts. */
export const THEME_STORAGE_KEY = 'campaign-builder:theme';

/** The switch's options in display order: follow the OS, pin light, pin dark.
 * @type {ThemePreference[]} */
export const THEMES = ['system', 'light', 'dark'];

/**
 * Coerce a stored value, which can be stale or hand-edited, to a valid preference.
 * @param {string | null | undefined} value
 * @returns {ThemePreference}
 */
export function normalizeTheme(value) {
  return value === 'light' || value === 'dark' ? value : 'system';
}

/**
 * The human-readable label for the preference, shown in the switch buttons' tooltips.
 * @param {ThemePreference} theme
 * @returns {string}
 */
export function themeLabel(theme) {
  return theme === 'system' ? 'System' : theme === 'light' ? 'Light' : 'Dark';
}
