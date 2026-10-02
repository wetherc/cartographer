/**
 * The toast text after Undo or Redo. A history step restores a whole save,
 * so the toast compares the campaign before the step with the one after it
 * and names each part that differs, for example "Undo restored characters
 * and the clock from the previous save." A GM who pressed Undo twice can then tell
 * which edit each press took back.
 *
 * This is pure logic. The fields compare by their JSON text, because a
 * restored save holds fresh objects for every entity, so identity says
 * nothing about change.
 */

/** @typedef {import('../types/storage.js').CampaignState} CampaignState */

/**
 * The name of each compared part, in the order the toast lists them.
 * `entryTiles` is folded into the party position, and `version` is left out,
 * because neither is something the GM edits.
 * @type {[keyof CampaignState, string][]}
 */
const PARTS = [
  ['nodes', 'the map'],
  ['party', 'the party position'],
  ['characters', 'characters'],
  ['creatures', 'creatures'],
  ['quests', 'quests'],
  ['handouts', 'handouts'],
  ['bestiary', 'the bestiary'],
  ['travelog', 'the travelogue'],
  ['clock', 'the clock'],
  ['splitParty', 'party splitting'],
  ['combat', 'the fight'],
];

/**
 * The parts of the campaign that differ between two saves.
 * @param {CampaignState} before
 * @param {CampaignState} after
 * @returns {string[]}
 */
export function changedParts(before, after) {
  return PARTS.filter(
    ([key]) => JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null),
  ).map(([, name]) => name);
}

/**
 * Join names into an English list: "a", "a and b", "a, b, and c".
 * @param {string[]} names
 * @returns {string}
 */
function listOf(names) {
  if (names.length <= 2) return names.join(' and ');
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

/**
 * The toast after an Undo.
 * @param {CampaignState} before the campaign in the tab before the step
 * @param {CampaignState} after the campaign the step wrote
 * @returns {string}
 */
export function undoSummary(before, after) {
  const parts = changedParts(before, after);
  return parts.length
    ? `Undo restored ${listOf(parts)} from the previous save.`
    : 'Restored the previous save.';
}

/**
 * The toast after a Redo.
 * @param {CampaignState} before the campaign in the tab before the step
 * @param {CampaignState} after the campaign the step wrote
 * @returns {string}
 */
export function redoSummary(before, after) {
  const parts = changedParts(before, after);
  return parts.length
    ? `Redo reapplied the change to ${listOf(parts)}.`
    : 'Reapplied the undone change.';
}
