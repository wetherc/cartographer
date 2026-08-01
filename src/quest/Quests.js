/**
 * Pure helpers for the quest and session log. List-level operations (unique
 * id derivation, replace or remove by id) come from the rosters through
 * entities/Roster.js. This module owns only the per-quest shape and status
 * transitions. This keeps the module free of app state, so tests can run
 * against it directly.
 */

/** @typedef {import('../types/quest.js').Quest} Quest */
/** @typedef {import('../types/quest.js').QuestStatus} QuestStatus */

/**
 * @param {string} id
 * @param {string} title
 * @param {string} [notes]
 * @param {QuestStatus} [status]
 * @returns {Quest}
 */
export function createQuest(id, title, notes = '', status = 'active') {
  return { id, title, notes, status };
}

/**
 * @param {Quest} quest
 * @param {QuestStatus} status
 * @returns {Quest}
 */
export function setQuestStatus(quest, status) {
  return { ...quest, status };
}

/**
 * Flip a quest between active and completed.
 * @param {Quest} quest
 * @returns {Quest}
 */
export function toggleQuestStatus(quest) {
  return setQuestStatus(quest, quest.status === 'completed' ? 'active' : 'completed');
}

/**
 * Split quests into active-first, completed-last groups. Each group keeps
 * its original order, the order that a GM-facing panel shows.
 * @param {Quest[]} quests
 * @returns {{ active: Quest[], completed: Quest[] }}
 */
export function groupByStatus(quests) {
  return {
    active: quests.filter((q) => q.status === 'active'),
    completed: quests.filter((q) => q.status === 'completed'),
  };
}
