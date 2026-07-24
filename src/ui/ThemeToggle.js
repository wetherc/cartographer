import { icon } from './icons.js';
import { THEME_STORAGE_KEY, THEMES, normalizeTheme, themeLabel } from '../view/Theme.js';

/** @typedef {import('../view/Theme.js').ThemePreference} ThemePreference */
/** @typedef {import('./icons.js').IconName} IconName */

/** @type {Record<ThemePreference, IconName>} */
const THEME_ICONS = { system: 'monitor', light: 'sun', dark: 'moon' };

/**
 * Mount the header's theme switch: a System/Light/Dark segmented group in the
 * same shape as the mode and role switches. Light/Dark pin the color scheme
 * via data-theme on <html> (which the CSS light-dark() tokens resolve
 * against); System removes the attribute so the OS preference wins again. The
 * choice persists per browser in localStorage, where index.html's inline
 * script re-applies it before first paint on the next load.
 * @param {HTMLElement} container
 * @returns {{ getTheme: () => ThemePreference }}
 */
export function mountThemeToggle(container) {
  let theme = normalizeTheme(localStorage.getItem(THEME_STORAGE_KEY));

  const root = document.createElement('div');
  root.className = 'theme-switch';
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Color theme');
  container.appendChild(root);

  /** @type {Map<ThemePreference, HTMLButtonElement>} */
  const buttons = new Map();
  for (const value of THEMES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn theme-switch__btn';
    const label = `${themeLabel(value)} theme`;
    button.title = label;
    button.setAttribute('aria-label', label);
    button.appendChild(icon(THEME_ICONS[value]));
    button.addEventListener('click', () => {
      theme = value;
      if (theme === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
      else localStorage.setItem(THEME_STORAGE_KEY, theme);
      apply();
    });
    buttons.set(value, button);
    root.appendChild(button);
  }

  function apply() {
    if (theme === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    for (const [value, button] of buttons) {
      const active = value === theme;
      button.classList.toggle('theme-switch__btn--active', active);
      button.setAttribute('aria-pressed', String(active));
    }
  }

  apply();
  return { getTheme: () => theme };
}
