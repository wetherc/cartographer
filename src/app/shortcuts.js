import { mustGetElement } from '../ui/dom.js';
import { alertModal } from '../ui/Modal.js';
import { isGM } from '../view/ViewRole.js';
import { SHORTCUT_HELP, shortcutFor } from '../view/Shortcuts.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */

/**
 * App-wide keyboard shortcuts. Skipped while typing in a field or while a
 * dialog is open, so they never eat input; the map keeps its own keys (arrows,
 * Enter, +/-) via canvas focus. '?' doubles as discoverability for all of it.
 *
 * Which key means what is `view/Shortcuts.js`'s table; this is the listener over
 * it, plus the clicks and calls each action turns into. Save, Undo, and Redo go
 * through the header buttons rather than their handlers, so a shortcut and a
 * click are the same code path.
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
    // Only the modifier combinations have a browser default worth stopping; a
    // bare letter has none, and preventing it would be invisible either way.
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
