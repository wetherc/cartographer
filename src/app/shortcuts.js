import { mustGetElement } from '../ui/dom.js';
import { alertModal } from '../ui/Modal.js';
import { isGM } from '../view/ViewRole.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */

/**
 * App-wide keyboard shortcuts. Skipped while typing in a field or while a
 * dialog is open, so they never eat input; the map keeps its own keys (arrows,
 * Enter, +/-) via canvas focus. '?' doubles as discoverability for all of it.
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

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      mustGetElement('save-btn').click();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      // In Build mode, Ctrl+Z undoes the last stroke-level edit (the thing a GM
      // mid-painting reaches for); the header Undo button keeps the save-level
      // story, which Ctrl+Z still drives everywhere else.
      if (app.state.mode === 'build') app.actions.undoStroke();
      else mustGetElement('undo-btn').click();
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    const gm = isGM(app.state.role);
    if (event.key === 'b' && gm) app.actions.setMode('build');
    else if (event.key === 'p' && gm) app.actions.setMode('play');
    else if (event.key === '?') {
      alertModal(
        [
          'Ctrl/Cmd+S — save the campaign',
          'Ctrl/Cmd+Z — undo (Build: last edit; Play: previous save)',
          'B / P — switch to Build / Play mode',
          'On the map (click it first):',
          'Arrows — move the cursor · Enter/Space — act',
          '+ / - — zoom',
        ].join('\n'),
        { title: 'Keyboard shortcuts', label: 'Close' },
      );
    }
  });
}
