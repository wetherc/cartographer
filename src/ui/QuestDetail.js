import { badge, bareButton, removableChip, textButton } from './buttons.js';
import { el } from './dom.js';
import { icon } from './icons.js';
import { moveObjective, removeObjective, toggleObjectiveHidden } from '../quest/Objectives.js';
import { removeLink } from '../quest/QuestLinks.js';

/** @typedef {import('../types/quest.js').Quest} Quest */
/** @typedef {import('../types/quest.js').QuestObjective} QuestObjective */
/** @typedef {import('./listPanel.js').RowContext<Quest>} RowContext */

/**
 * One link as the panel draws it. `onOpen` is null when the link has no
 * place to show, for example a creature that stands on no map.
 * @typedef {{ key: string, label: string, onOpen: (() => void) | null }} LinkChip
 */

/**
 * The quest edits that the GM row makes. `onChange` applies a pure
 * transform to the current copy of the quest. `onToggleObjective` checks
 * off an objective or clears its check, and can then ask whether to reveal
 * the objective or complete the quest. The other callbacks open a dialog
 * first. Each resolves to false when the GM cancels, so the panel skips the
 * repaint.
 * @typedef {{
 *   onChange: (quest: Quest, change: (quest: Quest) => Quest) => unknown,
 *   onToggleObjective: (quest: Quest, id: string) => Promise<boolean>,
 *   onAddObjective: (quest: Quest) => Promise<boolean>,
 *   onEditObjective: (quest: Quest, objective: QuestObjective) => Promise<boolean>,
 *   onAddLink: (quest: Quest, kind: 'place' | 'creature') => Promise<boolean>,
 *   describeLinks: (quest: Quest) => LinkChip[],
 * }} QuestDetailCallbacks
 */

/**
 * A text button that repaints the panel once its handler resolves, unless
 * the handler reports that nothing changed.
 * @param {string} label
 * @param {string} ariaLabel
 * @param {() => Promise<boolean> | boolean} run
 * @param {RowContext} ctx
 * @param {{ icon?: import('./icons.js').IconName, variant?: import('./buttons.js').ButtonVariant }} [opts]
 */
function addButton(label, ariaLabel, run, ctx, { icon: glyph = 'add', variant } = {}) {
  return textButton(
    label,
    async () => {
      if (await run()) ctx.render();
    },
    { icon: glyph, variant, className: 'quest-detail__add', ariaLabel },
  );
}

/**
 * The objectives as a player reads them: a checked or an empty box, then the
 * text. The quest here is already the player copy, so no hidden objective
 * is in it.
 * @param {Quest} quest
 * @returns {HTMLElement | null}
 */
export function playerObjectives(quest) {
  if (quest.objectives.length === 0) return null;
  return el(
    'ul',
    'quest-detail__objectives',
    ...quest.objectives.map((o) =>
      el(
        'li',
        o.done ? 'quest-objective quest-objective--done' : 'quest-objective',
        el('span', 'quest-objective__status', icon(o.done ? 'boxChecked' : 'box', { size: 14 })),
        el('span', 'quest-objective__text', o.text),
      ),
    ),
  );
}

/**
 * The check-off toggle of one objective.
 * @param {Quest} quest
 * @param {QuestObjective} objective
 * @param {RowContext} ctx
 * @param {QuestDetailCallbacks} callbacks
 */
function doneToggle(quest, { id, text, done }, ctx, callbacks) {
  return ctx.action(
    {
      icon: done ? 'boxChecked' : 'box',
      label: done ? `Mark ${text} not done` : `Mark ${text} done`,
      pressed: done,
      onClick: () => callbacks.onToggleObjective(quest, id),
    },
    quest,
  );
}

/**
 * One objective row with the GM's controls: check off, edit (the text is
 * the edit button), hide from players, move up or down, and remove.
 * @param {Quest} quest
 * @param {QuestObjective} objective
 * @param {number} index
 * @param {RowContext} ctx
 * @param {QuestDetailCallbacks} callbacks
 */
function gmObjective(quest, objective, index, ctx, callbacks) {
  const { id, text, done, hidden } = objective;
  const change = (/** @type {(q: Quest) => Quest} */ transform) => () =>
    callbacks.onChange(quest, transform);
  const last = index === quest.objectives.length - 1;
  const edit = bareButton(
    [el('span', '', text || '(no text)'), hidden && badge('GM only', { variant: 'neutral' })],
    async () => {
      if (await callbacks.onEditObjective(quest, objective)) ctx.render();
    },
    { className: 'quest-objective__text', title: 'Edit objective' },
  );
  return el(
    'li',
    done ? 'quest-objective quest-objective--done' : 'quest-objective',
    doneToggle(quest, objective, ctx, callbacks),
    edit,
    ctx.action(
      {
        icon: hidden ? 'eye-off' : 'eye',
        label: hidden ? `Reveal ${text} to players` : `Hide ${text} from players`,
        pressed: !hidden,
        focusKey: `reveal:${quest.id}:${id}`,
        onClick: change((q) => toggleObjectiveHidden(q, id)),
      },
      quest,
    ),
    index > 0 &&
      ctx.action(
        { icon: 'up', label: `Move ${text} up`, onClick: change((q) => moveObjective(q, id, -1)) },
        quest,
      ),
    !last &&
      ctx.action(
        {
          icon: 'down',
          label: `Move ${text} down`,
          onClick: change((q) => moveObjective(q, id, 1)),
        },
        quest,
      ),
    ctx.action(
      {
        icon: 'remove',
        label: `Remove ${text}`,
        variant: 'danger',
        onClick: change((q) => removeObjective(q, id)),
      },
      quest,
    ),
  );
}

/**
 * One link chip: the label shows the link on the map, when it has a place
 * to show, and the x removes the link.
 * @param {Quest} quest
 * @param {LinkChip} chip
 * @param {RowContext} ctx
 * @param {QuestDetailCallbacks} callbacks
 */
function linkChip(quest, chip, ctx, callbacks) {
  return removableChip(
    chip.label,
    async () => {
      if ((await callbacks.onChange(quest, (q) => removeLink(q, chip.key))) !== false) {
        ctx.render();
      }
    },
    {
      className: 'quest-detail__link',
      removeLabel: `the link to ${chip.label}`,
      onClick: chip.onOpen ?? undefined,
      title: `Show ${chip.label} on the map`,
    },
  );
}

/**
 * The expanded GM part of a quest row: the notes, the objectives with their
 * controls, the links, and a row of buttons. The buttons add an objective or
 * a link, and edit or delete the quest. Edit and Delete sit here and not on
 * the row head, so the head keeps room for the title on a narrow rail.
 * @param {Quest} quest
 * @param {RowContext} ctx
 * @param {QuestDetailCallbacks & {
 *   onEdit: (quest: Quest) => Promise<boolean> | boolean,
 *   onDelete: (id: string) => Promise<boolean> | boolean,
 * }} callbacks
 * @returns {HTMLElement}
 */
export function gmQuestDetail(quest, ctx, callbacks) {
  const links = callbacks.describeLinks(quest);
  return el(
    'div',
    'quest-detail u-col u-g1',
    quest.notes ? el('p', 'quest-detail__notes u-muted', quest.notes) : null,
    quest.objectives.length > 0
      ? el(
          'ul',
          'quest-detail__objectives',
          ...quest.objectives.map((o, i) => gmObjective(quest, o, i, ctx, callbacks)),
        )
      : null,
    links.length > 0
      ? el(
          'div',
          'quest-detail__links u-row u-g1',
          ...links.map((chip) => linkChip(quest, chip, ctx, callbacks)),
        )
      : null,
    el(
      'div',
      'quest-detail__adds u-row u-g1',
      addButton(
        'Objective',
        `Add an objective to ${quest.title}`,
        () => callbacks.onAddObjective(quest),
        ctx,
      ),
      addButton(
        'Link place',
        `Link a place to ${quest.title}`,
        () => callbacks.onAddLink(quest, 'place'),
        ctx,
      ),
      addButton(
        'Link creature',
        `Link a creature to ${quest.title}`,
        () => callbacks.onAddLink(quest, 'creature'),
        ctx,
      ),
    ),
    el(
      'div',
      'quest-detail__adds u-row u-g1',
      addButton('Edit', `Edit ${quest.title}`, () => callbacks.onEdit(quest), ctx, {
        icon: 'edit',
      }),
      addButton('Delete', `Delete ${quest.title}`, () => callbacks.onDelete(quest.id), ctx, {
        icon: 'remove',
        variant: 'danger',
      }),
    ),
  );
}
