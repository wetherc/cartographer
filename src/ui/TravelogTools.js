import { bareButton, textButton } from './buttons.js';
import { el } from './dom.js';
import { checkbox, textareaField } from './formFields.js';
import { LOG_KIND_LABELS } from '../log/Travelogue.js';

/** @typedef {import('../types/log.js').LogEntryKind} LogEntryKind */

/**
 * The note box of the travelogue: a text area, a GM only box, and an Add
 * note button. The button stays disabled while the text is blank. A note
 * that the caller accepts clears the text, and the GM only box keeps its
 * state for the next note.
 * @param {(text: string, gmOnly: boolean) => void} onAdd
 * @returns {HTMLElement}
 */
export function buildNoteForm(onAdd) {
  const text = textareaField('', {
    rows: 2,
    placeholder: 'What happened?',
    className: 'travelog__note-text',
    ariaLabel: 'Note text',
  });
  const gmOnly = checkbox('GM only', false, { className: 'travelog__note-gm' });
  const add = textButton('Add note', () => submit(), {
    icon: 'add',
    className: 'travelog__note-add',
  });
  const sync = () => {
    add.disabled = text.value.trim() === '';
  };
  const submit = () => {
    const note = text.value.trim();
    if (!note) return;
    onAdd(note, gmOnly.input.checked);
    text.value = '';
    sync();
  };
  text.addEventListener('input', sync);
  // Ctrl+Enter or Cmd+Enter adds the note, and plain Enter starts a new line.
  text.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      submit();
    }
  });
  sync();
  return el('div', 'travelog__note', text, el('div', 'travelog__note-row', gmOnly.label, add));
}

/**
 * One toggle chip per entry kind. Every kind shows at first. A click hides
 * or shows that kind, and `onChange` gets the set of hidden kinds. The
 * filter lives only in this tab and is not saved.
 * @param {(hidden: ReadonlySet<LogEntryKind>) => void} onChange
 * @returns {HTMLElement}
 */
export function buildKindFilter(onChange) {
  /** @type {Set<LogEntryKind>} */
  const hidden = new Set();
  const kinds = /** @type {LogEntryKind[]} */ (Object.keys(LOG_KIND_LABELS));
  const chips = kinds.map((kind) => {
    const button = bareButton(
      [LOG_KIND_LABELS[kind]],
      () => {
        if (hidden.has(kind)) hidden.delete(kind);
        else hidden.add(kind);
        button.setAttribute('aria-pressed', String(!hidden.has(kind)));
        onChange(hidden);
      },
      { className: `chip travelog__filter-chip travelog__filter-chip--${kind}` },
    );
    button.setAttribute('aria-pressed', 'true');
    return button;
  });
  const group = el('div', 'travelog__filters', ...chips);
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', 'Show entry kinds');
  return group;
}
