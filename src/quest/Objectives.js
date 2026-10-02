/**
 * Pure helpers for the objectives inside one quest. Every function takes a
 * quest and returns a new quest, or the same quest when the edit changes
 * nothing, for example an id that is gone because another tab removed the
 * objective while this tab showed it.
 */

/** @typedef {import('../types/quest.js').Quest} Quest */
/** @typedef {import('../types/quest.js').QuestObjective} QuestObjective */

/**
 * A fresh objective id for a list: `o` and one more than the highest number
 * in use. Ids that do not follow the pattern are skipped, so a hand-edited
 * save cannot make this collide.
 * @param {QuestObjective[]} objectives
 * @returns {string}
 */
export function nextObjectiveId(objectives) {
  let highest = 0;
  for (const { id } of objectives) {
    const match = /^o(\d+)$/.exec(id);
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return `o${highest + 1}`;
}

/**
 * Append an objective. It starts not done.
 * @param {Quest} quest
 * @param {string} text
 * @param {boolean} [hidden]
 * @returns {Quest}
 */
export function addObjective(quest, text, hidden = false) {
  const objective = { id: nextObjectiveId(quest.objectives), text, done: false, hidden };
  return { ...quest, objectives: [...quest.objectives, objective] };
}

/**
 * Replace one objective with `change(objective)`.
 * @param {Quest} quest
 * @param {string} id
 * @param {(objective: QuestObjective) => QuestObjective} change
 * @returns {Quest}
 */
function updateObjective(quest, id, change) {
  const index = quest.objectives.findIndex((o) => o.id === id);
  if (index < 0) return quest;
  const objectives = [...quest.objectives];
  objectives[index] = change(objectives[index]);
  return { ...quest, objectives };
}

/**
 * Set the text and the hidden flag of one objective.
 * @param {Quest} quest
 * @param {string} id
 * @param {{ text: string, hidden: boolean }} fields
 * @returns {Quest}
 */
export function editObjective(quest, id, { text, hidden }) {
  return updateObjective(quest, id, (o) => ({ ...o, text, hidden }));
}

/**
 * Check off an objective, or clear its check.
 * @param {Quest} quest
 * @param {string} id
 * @returns {Quest}
 */
export function toggleObjectiveDone(quest, id) {
  return updateObjective(quest, id, (o) => ({ ...o, done: !o.done }));
}

/**
 * Flip whether an objective shows on a player tab.
 * @param {Quest} quest
 * @param {string} id
 * @returns {Quest}
 */
export function toggleObjectiveHidden(quest, id) {
  return updateObjective(quest, id, (o) => ({ ...o, hidden: !o.hidden }));
}

/**
 * Swap an objective with its neighbor above (`-1`) or below (`1`). An
 * objective already at that end of the list stays where it is.
 * @param {Quest} quest
 * @param {string} id
 * @param {-1 | 1} step
 * @returns {Quest}
 */
export function moveObjective(quest, id, step) {
  const from = quest.objectives.findIndex((o) => o.id === id);
  const to = from + step;
  if (from < 0 || to < 0 || to >= quest.objectives.length) return quest;
  const objectives = [...quest.objectives];
  [objectives[from], objectives[to]] = [objectives[to], objectives[from]];
  return { ...quest, objectives };
}

/**
 * @param {Quest} quest
 * @param {string} id
 * @returns {Quest}
 */
export function removeObjective(quest, id) {
  const objectives = quest.objectives.filter((o) => o.id !== id);
  return objectives.length === quest.objectives.length ? quest : { ...quest, objectives };
}

/**
 * How many objectives are done, out of how many.
 * @param {QuestObjective[]} objectives
 * @returns {{ done: number, total: number }}
 */
export function objectiveProgress(objectives) {
  return { done: objectives.filter((o) => o.done).length, total: objectives.length };
}

/**
 * Whether a quest has objectives and every one of them is done. A quest with
 * no objectives returns false, so checking the last box of a list is the
 * only event that offers to complete a quest.
 * @param {QuestObjective[]} objectives
 * @returns {boolean}
 */
export function allObjectivesDone(objectives) {
  return objectives.length > 0 && objectives.every((o) => o.done);
}
