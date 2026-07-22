import { groupByStatus } from '../quest/Quests.js';
import { icon } from './icons.js';

/** @typedef {import('../types/quest.js').Quest} Quest */

/**
 * Mount the quest/session log: active quests first, completed ones below,
 * each with a toggle-complete, edit, and delete affordance, plus a "New quest"
 * control. The panel owns no state — `getQuests` supplies the rows and every
 * mutation flows back through a callback, matching the other panels. Modals
 * (add/edit/confirm) live in main.js.
 * @param {HTMLElement} container
 * @param {{
 *   getQuests: () => Quest[],
 *   onToggle: (quest: Quest) => void,
 *   onEdit: (quest: Quest) => Promise<boolean> | boolean,
 *   onDelete: (id: string) => Promise<boolean> | boolean,
 *   onAdd: () => Promise<Quest | null>,
 * }} callbacks
 * @returns {{ update: () => void }}
 */
export function mountQuestPanel(container, callbacks) {
  const root = document.createElement('div');
  root.className = 'quest-panel';
  container.appendChild(root);

  /** @param {Quest} quest */
  function buildRow(quest) {
    const row = document.createElement('div');
    row.className = 'quest-panel__row';
    if (quest.status === 'completed') row.classList.add('quest-panel__row--completed');

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'btn btn--icon';
    const done = quest.status === 'completed';
    toggle.setAttribute('aria-label', done ? `Reopen ${quest.title}` : `Complete ${quest.title}`);
    toggle.setAttribute('aria-pressed', String(done));
    toggle.appendChild(icon(done ? 'heal' : 'add'));
    toggle.addEventListener('click', () => {
      callbacks.onToggle(quest);
      render();
    });

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

    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'btn btn--icon';
    editButton.setAttribute('aria-label', `Edit ${quest.title}`);
    editButton.appendChild(icon('edit'));
    editButton.addEventListener('click', async () => {
      if (await callbacks.onEdit(quest)) render();
    });

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'btn btn--icon';
    deleteButton.setAttribute('aria-label', `Delete ${quest.title}`);
    deleteButton.appendChild(icon('remove'));
    deleteButton.addEventListener('click', async () => {
      if (await callbacks.onDelete(quest.id)) render();
    });

    row.append(toggle, body, editButton, deleteButton);
    return row;
  }

  /** @param {string} label @param {Quest[]} quests */
  function buildGroup(label, quests) {
    const group = document.createElement('div');
    group.className = 'quest-panel__group';
    const heading = document.createElement('h3');
    heading.className = 'quest-panel__group-title';
    heading.textContent = label;
    group.appendChild(heading);
    for (const quest of quests) group.appendChild(buildRow(quest));
    return group;
  }

  function render() {
    root.innerHTML = '';
    const quests = callbacks.getQuests();

    if (quests.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'No quests yet.';
      root.appendChild(empty);
    } else {
      const { active, completed } = groupByStatus(quests);
      if (active.length > 0) root.appendChild(buildGroup('Active', active));
      if (completed.length > 0) root.appendChild(buildGroup('Completed', completed));
    }

    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.className = 'btn quest-panel__add';
    addButton.append(icon('add'), document.createTextNode('New quest'));
    addButton.addEventListener('click', async () => {
      if (await callbacks.onAdd()) render();
    });
    root.appendChild(addButton);
  }

  render();
  return { update: render };
}
