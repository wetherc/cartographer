/**
 * Pure helpers for the quest/session log. List-level operations (unique id
 * derivation, replace/remove by id) are shared with the rosters via
 * entities/Roster.js; this module owns only the per-quest shape and status
 * transitions, so it stays app-state-free and unit-testable.
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
 * Partition quests into active-first, completed-last groups, preserving each
 * group's original order — the order a GM-facing panel wants to render.
 * @param {Quest[]} quests
 * @returns {{ active: Quest[], completed: Quest[] }}
 */
export function groupByStatus(quests) {
  return {
    active: quests.filter((q) => q.status === 'active'),
    completed: quests.filter((q) => q.status === 'completed'),
  };
}
