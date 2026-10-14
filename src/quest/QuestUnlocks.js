/**
 * Pure helpers for the quests that one quest unlocks. A quest lists the ids
 * of other quests in `unlocks`. When the GM completes it, the completion
 * dialog offers to reveal each of those quests that players do not see yet.
 */

/** @typedef {import('../types/quest.js').Quest} Quest */

/**
 * The unlock list from the dialog's multiselect value: the ids in order,
 * without blanks, repeats, or the quest's own id.
 * @param {string | undefined} value comma-separated quest ids
 * @param {string | null} selfId the id of the quest being edited
 * @returns {string[]}
 */
export function parseUnlocks(value, selfId) {
  const ids = (value ?? '').split(',').map((id) => id.trim());
  return [...new Set(ids.filter((id) => id !== '' && id !== selfId))];
}

/**
 * The quests that `quest` unlocks and that players do not see yet, in the
 * order of its list. An id of a deleted quest gives nothing.
 * @param {Quest[]} quests
 * @param {Quest} quest
 * @returns {Quest[]}
 */
export function hiddenUnlocks(quests, quest) {
  return quest.unlocks.flatMap((id) => {
    const next = quests.find((q) => q.id === id);
    return next && !next.revealed ? [next] : [];
  });
}

/**
 * Take the ids of deleted quests out of every unlock list. The array, and
 * each quest with nothing to drop, keep their identity.
 * @param {Quest[]} quests
 * @returns {Quest[]}
 */
export function dropMissingUnlocks(quests) {
  const live = new Set(quests.map((q) => q.id));
  let changed = false;
  const next = quests.map((q) => {
    if (q.unlocks.every((id) => live.has(id))) return q;
    changed = true;
    return { ...q, unlocks: q.unlocks.filter((id) => live.has(id)) };
  });
  return changed ? next : quests;
}
