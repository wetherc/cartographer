import { el } from './dom.js';
import { groupByStatus, visibleQuests } from '../quest/Quests.js';
import { icon } from './icons.js';
import { isGM } from '../view/ViewRole.js';
import { mountListPanel } from './listPanel.js';

/** @typedef {import('../types/quest.js').Quest} Quest */
/** @typedef {import('../types/view.js').ViewRole} ViewRole */

/**
 * Mount the quest/session log: active quests first, then completed quests
 * below, each with a toggle-complete, reveal, edit, and delete control, plus
 * a "New quest" control. The panel owns no state. `getQuests` supplies the
 * rows, and every mutation flows back through a callback, matching the other
 * panels. Modals for add, edit, and confirm live in main.js.
 *
 * When `getRole` reports a player view, the log is read-only and lists only
 * the revealed quests. A player row has a static status glyph and the title,
 * with no notes, since the notes are the GM's leads and spoilers. The panel
 * omits the add control.
 *
 * In a GM tab, a quest's notes start hidden behind a per-row toggle, and the
 * panel scrolls once the list outgrows its room. A long-running campaign
 * collects dozens of quests with a paragraph each, and with every note open
 * the list pushes the rest of the rail off the screen. The set of expanded
 * rows lives in this closure, not in the campaign, so it is per browser and
 * resets with a reload.
 * @param {HTMLElement} container
 * @param {{
 *   getQuests: () => Quest[],
 *   onToggle: (quest: Quest) => void,
 *   onToggleRevealed: (quest: Quest) => void,
 *   onEdit: (quest: Quest) => Promise<boolean> | boolean,
 *   onDelete: (id: string) => Promise<boolean> | boolean,
 *   onAdd: () => Promise<Quest | null>,
 *   getRole?: () => ViewRole,
 * }} callbacks
 * @returns {{ update: () => void }}
 */
export function mountQuestPanel(container, callbacks) {
  /** The ids of the quests showing their notes. @type {Set<string>} */
  const expanded = new Set();

  return mountListPanel(container, {
    className: 'quest-panel',
    gate: () => !callbacks.getRole || isGM(callbacks.getRole()),
    // The two status groups start as one flat list. `groupOf` re-splits the
    // list into the Active and Completed sections.
    getRows: (gm) => {
      const { active, completed } = groupByStatus(visibleQuests(callbacks.getQuests(), gm));
      return [...active, ...completed];
    },
    groupOf: (quest) => (quest.status === 'completed' ? 'Completed' : 'Active'),
    emptyMessage: (gm) => (gm ? 'No quests yet.' : 'No quests shared yet.'),
    classes: {
      group: 'quest-panel__group',
      groupHeading: 'quest-panel__group-title',
      rowModifiers: (quest) => [quest.status === 'completed' && 'quest-panel__row--completed'],
      add: 'quest-panel__add',
    },
    buildBody: (quest, ctx) => {
      const done = quest.status === 'completed';
      const title = el('span', 'quest-panel__title', quest.title);

      // A player sees the status glyph and the title, with no control.
      if (!ctx.gm) {
        return [
          el('span', 'quest-panel__status', icon(done ? 'check' : 'add')),
          el('div', 'quest-panel__body u-col u-g1', title),
        ];
      }

      // A completed quest's toggle shows a check. An active quest's toggle
      // shows a plus, to mark it done. The glyph tracks the quest's state.
      const toggle = ctx.action(
        {
          icon: done ? 'check' : 'add',
          label: done ? `Reopen ${quest.title}` : `Complete ${quest.title}`,
          pressed: done,
          onClick: () => callbacks.onToggle(quest),
        },
        quest,
      );

      const open = expanded.has(quest.id);
      const body = el(
        'div',
        'quest-panel__body u-col u-g1',
        title,
        // A ternary, not `&&`: an empty string is a legal child that `el`
        // appends as an empty text node. Absent notes must add nothing.
        quest.notes && open ? el('span', 'u-muted', quest.notes) : null,
      );

      // A quest with no notes has nothing to expand, so it gets no toggle.
      const notesToggle = quest.notes
        ? ctx.action(
            {
              icon: 'chevron',
              label: open ? `Hide notes for ${quest.title}` : `Show notes for ${quest.title}`,
              pressed: open,
              onClick: () => {
                if (open) expanded.delete(quest.id);
                else expanded.add(quest.id);
              },
            },
            quest,
          )
        : null;
      if (notesToggle) notesToggle.classList.add('quest-panel__notes-toggle');

      return notesToggle ? [toggle, body, notesToggle] : [toggle, body];
    },
    actions: (quest, ctx) =>
      ctx.gm
        ? [
            {
              icon: quest.revealed ? 'eye' : 'eye-off',
              label: quest.revealed
                ? `Hide ${quest.title} from players`
                : `Reveal ${quest.title} to players`,
              pressed: quest.revealed,
              onClick: () => callbacks.onToggleRevealed(quest),
            },
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
