import { el } from './dom.js';
import { groupByStatus } from '../quest/Quests.js';
import { icon } from './icons.js';
import { isGM } from '../view/ViewRole.js';
import { mountListPanel } from './listPanel.js';

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
  return mountListPanel(container, {
    className: 'quest-panel',
    gate: () => !callbacks.getRole || isGM(callbacks.getRole()),
    // The two status groups are one flat list; `groupOf` re-splits it into the
    // Active and Completed sections.
    getRows: () => {
      const { active, completed } = groupByStatus(callbacks.getQuests());
      return [...active, ...completed];
    },
    groupOf: (quest) => (quest.status === 'completed' ? 'Completed' : 'Active'),
    groupWrapperClass: 'quest-panel__group',
    groupHeadingClass: 'section-label quest-panel__group-title',
    emptyMessage: 'No quests yet.',
    rowModifiers: (quest) => [quest.status === 'completed' && 'quest-panel__row--completed'],
    buildBody: (quest, ctx) => {
      const done = quest.status === 'completed';

      /** @type {Node} */
      let toggle;
      if (ctx.gm) {
        // A completed quest's toggle shows a check; an active one shows a plus to
        // add/mark-done, so the glyph tracks the quest's state.
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
        // Players see the status glyph without the affordance to flip it.
        toggle = el('span', 'quest-panel__status', icon(done ? 'check' : 'add'));
      }

      const body = el(
        'div',
        'quest-panel__body',
        el('span', 'quest-panel__title', quest.title),
        // A ternary rather than `&&`: an empty string is a legal child that `el`
        // would append as an empty text node, where absent notes should add
        // nothing at all.
        quest.notes ? el('span', 'quest-panel__notes', quest.notes) : null,
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
    addClass: 'quest-panel__add',
  });
}
