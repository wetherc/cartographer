import { mustGetElement } from '../ui/dom.js';
import { alertModal } from '../ui/Modal.js';
import { isGM } from '../view/ViewRole.js';
import { SHORTCUT_HELP, shortcutFor } from '../view/Shortcuts.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */

/**
 * App-wide keyboard shortcuts. The app skips shortcuts while the user types
 * in a field or while a dialog is open, so a shortcut never eats input. The
 * map keeps its own keys (arrows, Enter, +/-) through canvas focus. The '?'
 * key shows the shortcut list.
 *
 * `view/Shortcuts.js` holds the table of which key means what. This
 * function is the listener over that table, plus the clicks and calls each
 * action turns into. Save, Undo, and Redo go through the header buttons,
 * not their own handlers, so a shortcut and a click run the same code path.
 * @param {AppContext} app
 */
export function wireShortcuts(app) {
  document.addEventListener('keydown', (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    const typing =
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      target.isContentEditable;
    if (typing || document.querySelector('dialog[open]')) return;

    const action = shortcutFor(event, { mode: app.state.mode, gm: isGM(app.state.role) });
    if (!action) return;
    // Only modifier-key combinations have a browser default worth stopping.
    // A bare letter has no default, so preventing it has no visible effect.
    if (event.ctrlKey || event.metaKey) event.preventDefault();

    if (action === 'save') mustGetElement('save-btn').click();
    else if (action === 'undo') mustGetElement('undo-btn').click();
    else if (action === 'undo-stroke') app.actions.undoStroke();
    else if (action === 'redo') mustGetElement('redo-btn').click();
    else if (action === 'build') app.actions.setMode('build');
    else if (action === 'play') app.actions.setMode('play');
    else if (action === 'help') {
      alertModal(SHORTCUT_HELP.join('\n'), { title: 'Keyboard shortcuts', label: 'Close' });
    }
  });
}
