/**
 * Pure helpers for the quest and session log. List-level operations (unique
 * id derivation, replace or remove by id) come from the rosters through
 * entities/Roster.js. This module owns only the per-quest fields, the status
 * transitions, the reveal toggle, and the copy of a quest that a player
 * sees. Objectives live in `Objectives.js` and links in `QuestLinks.js`.
 * This keeps the module free of app state, so tests can run against it
 * directly.
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
  return { id, title, notes, status, revealed, objectives: [], links: [], unlocks: [] };
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
 * The travelogue line for a quest the GM just revealed or hid, with its log
 * options. A revealed quest is news for every viewer. A hidden quest is
 * GM-only, so a Player tab does not learn its title.
 * @param {Quest} quest the quest after the change
 * @returns {[string, import('../types/log.js').LogOptions | undefined]}
 */
export function questRevealLine(quest) {
  return quest.revealed
    ? [`The party learns of the quest ${quest.title}.`, undefined]
    : [`The quest ${quest.title} is hidden from players.`, { gm: true }];
}

/**
 * The player copies already made, keyed on the quest object. A quest is
 * never changed in place, so a cached copy stays current. The cache also
 * keeps the list panel's repaint guard working on a player tab. The guard
 * compares row objects, and a fresh copy on every refresh would repaint the
 * log on every party step.
 * @type {WeakMap<Quest, Quest>}
 */
const playerCopies = new WeakMap();

/**
 * The quest as a player tab draws it. The GM notes are empty, the hidden
 * objectives are gone, and the links and unlocks are gone, because a link
 * names a place or a creature, and an unlock names a quest, that the party
 * may not know yet. The player panel builds
 * its rows from this copy only, so no GM-only text gets into the player
 * screen. The live state keeps the whole quest. A player tab sends its
 * edits as a diff against that state, so a stripped quest in the state
 * would send the removal of every hidden objective to the GM tab.
 * @param {Quest} quest
 * @returns {Quest}
 */
export function playerQuestView(quest) {
  const cached = playerCopies.get(quest);
  if (cached) return cached;
  /** @type {Quest} */
  const copy = {
    id: quest.id,
    title: quest.title,
    notes: '',
    status: quest.status,
    revealed: quest.revealed,
    objectives: quest.objectives.filter((o) => !o.hidden),
    links: [],
    unlocks: [],
  };
  playerCopies.set(quest, copy);
  return copy;
}

/**
 * The quests one role can see. A GM sees every quest as it is. A player
 * sees only the revealed ones, each as `playerQuestView` gives it, so a
 * quest that the party has not found yet does not spoil the story on a
 * player screen.
 * @param {Quest[]} quests
 * @param {boolean} gm
 * @returns {Quest[]}
 */
export function visibleQuests(quests, gm) {
  return gm ? quests : quests.filter((q) => q.revealed).map(playerQuestView);
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
