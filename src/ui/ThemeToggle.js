import { segSwitch } from './buttons.js';
import { THEME_STORAGE_KEY, THEMES, normalizeTheme, themeLabel } from '../view/Theme.js';

/** @typedef {import('../view/Theme.js').ThemePreference} ThemePreference */
/** @typedef {import('./icons.js').IconName} IconName */

/** @type {Record<ThemePreference, IconName>} */
const THEME_ICONS = { system: 'monitor', light: 'sun', dark: 'moon' };

/**
 * Mount the header's theme switch: a System, Light, Dark segmented group
 * in the same shape as the mode and role switches. Light and Dark pin the
 * color scheme through data-theme on <html>, which the CSS light-dark()
 * tokens resolve against. System removes the attribute, so the OS
 * preference applies again. The choice persists per browser in
 * localStorage. The inline script in index.html reapplies it before the
 * first paint on the next load.
 * @param {HTMLElement} container
 * @returns {{ getTheme: () => ThemePreference }}
 */
export function mountThemeToggle(container) {
  let theme = normalizeTheme(localStorage.getItem(THEME_STORAGE_KEY));

  const switcher = segSwitch({
    ariaLabel: 'Color theme',
    options: THEMES.map((value) => ({
      value,
      icon: THEME_ICONS[value],
      ariaLabel: `${themeLabel(value)} theme`,
    })),
    value: theme,
    onChange: (next) => {
      theme = next;
      if (theme === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
      else localStorage.setItem(THEME_STORAGE_KEY, theme);
      applyTheme();
    },
  });
  container.appendChild(switcher.element);

  function applyTheme() {
    if (theme === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  }

  applyTheme();
  return { getTheme: () => theme };
}
