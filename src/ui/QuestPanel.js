import { el } from './dom.js';
import { groupByStatus } from '../quest/Quests.js';
import { icon } from './icons.js';
import { isGM } from '../view/ViewRole.js';
import { mountListPanel } from './listPanel.js';

/** @typedef {import('../types/quest.js').Quest} Quest */
/** @typedef {import('../types/view.js').ViewRole} ViewRole */

/**
 * Mount the quest/session log: active quests first, then completed quests
 * below, each with a toggle-complete, edit, and delete control, plus a
 * "New quest" control. The panel owns no state. `getQuests` supplies the
 * rows, and every mutation flows back through a callback, matching the other
 * panels. Modals for add, edit, and confirm live in main.js. When `getRole`
 * reports a player view, the log is read-only: rows render with a static
 * status glyph and no edit or delete control, and the panel omits the add
 * control.
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
  return mountListPanel(container, {
    className: 'quest-panel',
    gate: () => !callbacks.getRole || isGM(callbacks.getRole()),
    // The two status groups start as one flat list. `groupOf` re-splits the
    // list into the Active and Completed sections.
    getRows: () => {
      const { active, completed } = groupByStatus(callbacks.getQuests());
      return [...active, ...completed];
    },
    groupOf: (quest) => (quest.status === 'completed' ? 'Completed' : 'Active'),
    emptyMessage: 'No quests yet.',
    classes: {
      group: 'quest-panel__group',
      groupHeading: 'quest-panel__group-title',
      rowModifiers: (quest) => [quest.status === 'completed' && 'quest-panel__row--completed'],
      add: 'quest-panel__add',
    },
    buildBody: (quest, ctx) => {
      const done = quest.status === 'completed';

      /** @type {Node} */
      let toggle;
      if (ctx.gm) {
        // A completed quest's toggle shows a check. An active quest's toggle
        // shows a plus, to mark it done. The glyph tracks the quest's state.
        toggle = ctx.action(
          {
            icon: done ? 'check' : 'add',
            label: done ? `Reopen ${quest.title}` : `Complete ${quest.title}`,
            pressed: done,
            onClick: () => callbacks.onToggle(quest),
          },
          quest,
        );
      } else {
        // A player sees the status glyph with no control to flip it.
        toggle = el('span', 'quest-panel__status', icon(done ? 'check' : 'add'));
      }

      const body = el(
        'div',
        'quest-panel__body u-col u-g1',
        el('span', 'quest-panel__title', quest.title),
        // A ternary, not `&&`: an empty string is a legal child that `el`
        // appends as an empty text node. Absent notes must add nothing.
        quest.notes ? el('span', 'u-muted', quest.notes) : null,
      );

      return [toggle, body];
    },
    actions: (quest, ctx) =>
      ctx.gm
        ? [
            { icon: 'edit', label: `Edit ${quest.title}`, onClick: () => callbacks.onEdit(quest) },
            {
              icon: 'remove',
              label: `Delete ${quest.title}`,
              variant: 'danger',
              onClick: () => callbacks.onDelete(quest.id),
            },
          ]
        : [],
    addButtons: () => [{ label: 'New quest', icon: 'add', onClick: callbacks.onAdd }],
  });
}
