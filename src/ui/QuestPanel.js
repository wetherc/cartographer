import { groupByStatus } from '../quest/Quests.js';
import { iconButton, textButton, emptyState } from './buttons.js';
import { icon } from './icons.js';
import { isGM } from '../view/ViewRole.js';

/** @typedef {import('../types/quest.js').Quest} Quest */
/** @typedef {import('../types/view.js').ViewRole} ViewRole */

/**
 * Mount the quest/session log: active quests first, completed ones below,
 * each with a toggle-complete, edit, and delete affordance, plus a "New quest"
 * control. The panel owns no state — `getQuests` supplies the rows and every
 * mutation flows back through a callback, matching the other panels. Modals
 * (add/edit/confirm) live in main.js. When `getRole` reports a player view,
 * the log is read-only: rows render with a static status glyph and no
 * edit/delete, and the add control is omitted.
 * @param {HTMLElement} container
 * @param {{
 *   getQuests: () => Quest[],
 *   onToggle: (quest: Quest) => void,
 *   onEdit: (quest: Quest) => Promise<boolean> | boolean,
 *   onDelete: (id: string) => Promise<boolean> | boolean,
 *   onAdd: () => Promise<Quest | null>,
 *   getRole?: () => ViewRole,
 * }} callbacks
 * @returns {{ update: () => void }}
 */
export function mountQuestPanel(container, callbacks) {
  const root = document.createElement('div');
  root.className = 'quest-panel';
  container.appendChild(root);

  const gmView = () => !callbacks.getRole || isGM(callbacks.getRole());

  /** @param {Quest} quest @param {boolean} gm */
  function buildRow(quest, gm) {
    const row = document.createElement('div');
    row.className = 'quest-panel__row';
    if (quest.status === 'completed') row.classList.add('quest-panel__row--completed');

    const done = quest.status === 'completed';
    /** @type {HTMLElement} */
    let toggle;
    if (gm) {
      // A completed quest's toggle shows a check; an active one shows a plus to
      // add/mark-done, so the glyph tracks the quest's state.
      const btn = iconButton(
        done ? 'check' : 'add',
        done ? `Reopen ${quest.title}` : `Complete ${quest.title}`,
        () => {
          callbacks.onToggle(quest);
          render();
        },
      );
      btn.setAttribute('aria-pressed', String(done));
      toggle = btn;
    } else {
      // Players see the status glyph without the affordance to flip it.
      toggle = document.createElement('span');
      toggle.className = 'quest-panel__status';
      toggle.appendChild(icon(done ? 'check' : 'add'));
    }

    const body = document.createElement('div');
    body.className = 'quest-panel__body';
    const title = document.createElement('span');
    title.className = 'quest-panel__title';
    title.textContent = quest.title;
    body.appendChild(title);
    if (quest.notes) {
      const notes = document.createElement('span');
      notes.className = 'quest-panel__notes';
      notes.textContent = quest.notes;
      body.appendChild(notes);
    }

    if (!gm) {
      row.append(toggle, body);
      return row;
    }

    const editButton = iconButton('edit', `Edit ${quest.title}`, async () => {
      if (await callbacks.onEdit(quest)) render();
    });

    const deleteButton = iconButton(
      'remove',
      `Delete ${quest.title}`,
      async () => {
        if (await callbacks.onDelete(quest.id)) render();
      },
      { variant: 'danger' },
    );

    row.append(toggle, body, editButton, deleteButton);
    return row;
  }

  /** @param {string} label @param {Quest[]} quests @param {boolean} gm */
  function buildGroup(label, quests, gm) {
    const group = document.createElement('div');
    group.className = 'quest-panel__group';
    const heading = document.createElement('h3');
    heading.className = 'quest-panel__group-title';
    heading.textContent = label;
    group.appendChild(heading);
    for (const quest of quests) group.appendChild(buildRow(quest, gm));
    return group;
  }

  function render() {
    root.innerHTML = '';
    const gm = gmView();
    const quests = callbacks.getQuests();

    if (quests.length === 0) {
      root.appendChild(emptyState('No quests yet.'));
    } else {
      const { active, completed } = groupByStatus(quests);
      if (active.length > 0) root.appendChild(buildGroup('Active', active, gm));
      if (completed.length > 0) root.appendChild(buildGroup('Completed', completed, gm));
    }

    if (!gm) return;
    const addButton = textButton(
      'New quest',
      async () => {
        if (await callbacks.onAdd()) render();
      },
      { icon: 'add', className: 'quest-panel__add' },
    );
    root.appendChild(addButton);
  }

  render();
  return { update: render };
}
