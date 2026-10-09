/**
 * The messages of the header controls that replace the live campaign (New,
 * Load example, Import). `app/replaceActions.js` shows them.
 */

/**
 * Why an imported campaign cannot replace the live one, or null when it can.
 * Any JSON record parses as a campaign, and one with no map nodes gives the
 * party and the map view nowhere to start.
 * @param {{ nodes: unknown[] }} state
 * @returns {string | null}
 */
export function importProblem(state) {
  return state.nodes.length === 0 ? 'That file has no map, so it is not a campaign file.' : null;
}

/**
 * The toast queued for after the reload: the action, the save notice, and
 * the history notice, with the empty ones left out.
 * @param {Array<string | null | undefined>} parts
 * @returns {string}
 */
export function reloadToast(parts) {
  return parts.filter(Boolean).join(' ');
}

/**
 * The toast of a finished import.
 * @param {boolean} adopted whether the file's library replaced the browser library
 * @returns {string}
 */
export function importedToast(adopted) {
  return adopted ? 'Campaign and library imported.' : 'Campaign imported.';
}
