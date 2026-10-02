/**
 * Completing a quest: the dialog that asks the GM, and the write that
 * follows. The dialog functions can be injected, so tests can run the logic
 * with no DOM, the same as `entityList.js`.
 */

import { confirmModal, promptModal } from '../ui/Modal.js';
import { replaceById } from '../entities/Roster.js';
import { questRevealLine, setQuestStatus, toggleQuestRevealed } from '../quest/Quests.js';
import { hiddenUnlocks, parseUnlocks } from '../quest/QuestUnlocks.js';
import { payReward, readReward, rewardLine } from '../quest/QuestReward.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/quest.js').Quest} Quest */
/** @typedef {import('../types/quest.js').QuestReward} QuestReward */
/** @typedef {{ reveal?: string[], reward?: QuestReward }} Completion */

/**
 * Mark a quest completed, show a toast, and write a travelogue line. The
 * line names the quest, so the line of a quest that players cannot see is
 * GM-only, and a Player tab leaves it out. The reward goes to the living
 * characters, with a line that says what each one got. Each quest in
 * `reveal` that is still hidden is then revealed, with its own line.
 * `logEvent` saves the change.
 * @param {AppContext} app
 * @param {Quest} quest
 * @param {Completion} [completion] the quests to reveal and the reward to pay
 * @returns {boolean} false when the quest is gone or already completed
 */
export function completeQuest(app, quest, { reveal = [], reward } = {}) {
  const { state } = app;
  const current = state.quests.find((q) => q.id === quest.id);
  if (!current || current.status === 'completed') return false;
  state.quests = replaceById(state.quests, setQuestStatus(current, 'completed'));
  app.toasts.show(`Completed ${current.title}.`);
  app.actions.logEvent(
    'note',
    `The party completes the quest ${current.title}.`,
    current.revealed ? undefined : { gm: true },
  );
  const paid = reward ? payReward(state.characters, reward) : null;
  const line = paid && rewardLine(paid.gp, paid.xp);
  if (paid && line) {
    state.characters = paid.characters;
    app.actions.refreshSelectedCharacter();
    app.actions.logEvent('note', line);
  }
  for (const id of reveal) {
    const next = state.quests.find((q) => q.id === id);
    if (!next || next.revealed) continue;
    const shown = toggleQuestRevealed(next);
    state.quests = replaceById(state.quests, shown);
    app.actions.logEvent('note', ...questRevealLine(shown));
  }
  return true;
}

/**
 * The reward fields of the completion dialog, prefilled from the reward.
 * @param {QuestReward} reward
 * @returns {import('../types/modal.js').ModalField[]}
 */
export function rewardFields(reward) {
  return [
    { name: 'gp', label: 'Reward gold (gp)', type: 'number', value: reward.gp, min: 0 },
    { name: 'xp', label: 'Reward XP', type: 'number', value: reward.xp, min: 0 },
    {
      name: 'per',
      label: 'Pay',
      type: 'select',
      value: reward.per,
      options: [
        { value: 'each', label: 'To each living character' },
        { value: 'total', label: 'As a total, split evenly' },
      ],
    },
  ];
}

/**
 * Ask the GM to complete a quest. When the quest unlocks hidden quests, the
 * dialog lists each one under "Also reveal", ticked, so the GM can reveal
 * the next step of the story in the same click. When the quest has a
 * reward, the dialog shows its gold and XP, and the GM can change them
 * before the party gets them. Without either, the dialog is a plain
 * confirm, or no dialog at all when `askPlain` is false.
 * @param {AppContext} app
 * @param {Quest} quest
 * @param {string} message
 * @param {{ prompt?: typeof promptModal, confirm?: typeof confirmModal, askPlain?: boolean }} [options]
 * @returns {Promise<Completion | null>} what to reveal and pay, or null when the GM declines
 */
export async function askCompletion(
  app,
  quest,
  message,
  { prompt = promptModal, confirm = confirmModal, askPlain = true } = {},
) {
  const buttons = { confirmLabel: 'Complete quest', cancelLabel: 'Not yet' };
  const hidden = hiddenUnlocks(app.state.quests, quest);
  if (hidden.length === 0 && !quest.reward) {
    if (!askPlain) return {};
    return (await confirm(message, { title: 'Quest done', ...buttons })) ? {} : null;
  }
  const ids = hidden.map((q) => q.id);
  /** @type {import('../types/modal.js').ModalField[]} */
  const reveal = hidden.length
    ? [
        {
          name: 'reveal',
          label: 'Also reveal',
          type: 'multiselect',
          value: ids.join(','),
          options: hidden.map((q) => ({ value: q.id, label: q.title })),
        },
      ]
    : [];
  const values = await prompt(
    'Quest done',
    [...(quest.reward ? rewardFields(quest.reward) : []), ...reveal],
    { message, submitLabel: buttons.confirmLabel, cancelLabel: buttons.cancelLabel },
  );
  if (!values) return null;
  return {
    reveal: parseUnlocks(values.reveal ?? '', quest.id).filter((id) => ids.includes(id)),
    reward: readReward(values),
  };
}
