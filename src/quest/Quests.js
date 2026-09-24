/**
 * Pure helpers for the quest and session log. List-level operations (unique
 * id derivation, replace or remove by id) come from the rosters through
 * entities/Roster.js. This module owns only the per-quest fields, the status
 * transitions, and the reveal toggle. This keeps the module free of app
 * state, so tests can run against it directly.
 */

/** @typedef {import('../types/quest.js').Quest} Quest */
/** @typedef {import('../types/quest.js').QuestStatus} QuestStatus */

/**
 * @param {string} id
 * @param {string} title
 * @param {string} [notes]
 * @param {QuestStatus} [status]
 * @param {boolean} [revealed]
 * @returns {Quest}
 */
export function createQuest(id, title, notes = '', status = 'active', revealed = false) {
  return { id, title, notes, status, revealed };
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
 * Flip whether players can see a quest.
 * @param {Quest} quest
 * @returns {Quest}
 */
export function toggleQuestRevealed(quest) {
  return { ...quest, revealed: !quest.revealed };
}

/**
 * The quests one role can see. A GM sees every quest. A player sees only
 * the revealed ones, so a quest that the party has not heard of yet does
 * not spoil the story on a player screen.
 * @param {Quest[]} quests
 * @param {boolean} gm
 * @returns {Quest[]}
 */
export function visibleQuests(quests, gm) {
  return gm ? quests : quests.filter((q) => q.revealed);
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
