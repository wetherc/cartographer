import { icon } from './icons.js';

/** @typedef {'play' | 'build'} AppMode */

/**
 * Mount a Play/Build segmented toggle in the header. The two modes are the same
 * app over the same campaign data: Play is the live-session view, Build is the
 * authoring view. The active button carries aria-pressed so assistive tech and
 * the eye both read which mode is current.
 * @param {HTMLElement} container
 * @param {AppMode} initialMode
 * @param {(mode: AppMode) => void} onChange
 * @returns {{ getMode: () => AppMode, setMode: (mode: AppMode) => void }}
 */
export function mountModeSwitch(container, initialMode, onChange) {
  let mode = initialMode;

  const root = document.createElement('div');
  root.className = 'mode-switch';
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'App mode');

  /** @type {Record<AppMode, HTMLButtonElement>} */
  const buttons = /** @type {any} */ ({});

  /** @param {AppMode} value @param {import('./icons.js').IconName} iconName @param {string} label */
  function make(value, iconName, label) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn mode-switch__btn';
    button.appendChild(icon(iconName));
    button.appendChild(document.createTextNode(label));
    button.addEventListener('click', () => setMode(value));
    buttons[value] = button;
    root.appendChild(button);
    return button;
  }

  make('play', 'dice', 'Play');
  make('build', 'edit', 'Build');

  /** @param {AppMode} next */
  function setMode(next) {
    mode = next;
    for (const [value, button] of Object.entries(buttons)) {
      const active = value === mode;
      button.classList.toggle('mode-switch__btn--active', active);
      button.setAttribute('aria-pressed', String(active));
    }
    onChange(mode);
  }

  container.appendChild(root);
  setMode(mode);

  return { getMode: () => mode, setMode };
}
