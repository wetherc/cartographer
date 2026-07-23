import { icon } from './icons.js';

/** @typedef {import('../types/view.js').ViewRole} ViewRole */

/**
 * Mount a GM/Player segmented toggle in the header. Independent of the
 * Play/Build mode switch: mode is what the operator is doing (authoring vs.
 * running), role is who the screen is for (the GM's full truth vs. the
 * players' abstracted view). A player-facing follower tab picks Player; the
 * GM's tab stays GM.
 * @param {HTMLElement} container
 * @param {ViewRole} initialRole
 * @param {(role: ViewRole) => void} onChange
 * @returns {{ getRole: () => ViewRole, setRole: (role: ViewRole) => void }}
 */
export function mountRoleSwitch(container, initialRole, onChange) {
  let role = initialRole;

  const root = document.createElement('div');
  root.className = 'role-switch';
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Viewer');

  /** @type {Record<ViewRole, HTMLButtonElement>} */
  const buttons = /** @type {any} */ ({});

  /** @param {ViewRole} value @param {import('./icons.js').IconName} iconName @param {string} label */
  function make(value, iconName, label) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn role-switch__btn';
    button.appendChild(icon(iconName));
    button.appendChild(document.createTextNode(label));
    button.addEventListener('click', () => setRole(value));
    buttons[value] = button;
    root.appendChild(button);
    return button;
  }

  make('gm', 'shield', 'GM');
  make('player', 'eye', 'Player');

  /** @param {ViewRole} next */
  function setRole(next) {
    role = next;
    for (const [value, button] of Object.entries(buttons)) {
      const active = value === role;
      button.classList.toggle('role-switch__btn--active', active);
      button.setAttribute('aria-pressed', String(active));
    }
    onChange(role);
  }

  container.appendChild(root);
  setRole(role);

  return { getRole: () => role, setRole };
}
