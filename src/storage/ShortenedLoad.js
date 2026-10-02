/**
 * A load that did not fit the decode limits, and the save hold that keeps
 * the full campaign stored until the GM decides.
 *
 * `decodeNodeList` (`TileCodec.js`) drops the nodes past `MAX_NODES` and
 * loads a node with no tiles once the save passes `MAX_TOTAL_CELLS`. The
 * state in memory is then a shortened copy of the save, and the next save
 * stores that copy over the full one. `deserialize` notes what it cut here,
 * keyed on the state it returns. A side table keeps the report off the
 * state, because `StateDiff` diffs every top-level field of a state.
 *
 * The hold is one flag for the page. The autosave and the flush skip their
 * write while it is on, and the Save button asks first. It does not stop a
 * campaign replace (New, Load example, Import, Undo), because each of those
 * stores a campaign the GM chose.
 */

/** @typedef {{ dropped: number, emptied: number }} Truncation */

/** @type {WeakMap<object, Truncation>} */
const truncations = new WeakMap();

/**
 * Note what a load cut from a state. A report with nothing cut is not kept.
 * @param {object} state the state `deserialize` returns
 * @param {Truncation} report
 */
export function noteTruncation(state, report) {
  if (report.dropped > 0 || report.emptied > 0) truncations.set(state, report);
}

/**
 * What the load of this state cut, or null when it cut nothing.
 * @param {object | null} state
 * @returns {Truncation | null}
 */
export function loadTruncation(state) {
  return (state && truncations.get(state)) ?? null;
}

let held = false;

/** Stop the autosave and the flush from writing. */
export function holdSaves() {
  held = true;
}

/** Let the autosave and the flush write again. */
export function releaseSaves() {
  held = false;
}

/**
 * Whether saves are on hold.
 * @returns {boolean}
 */
export function savesHeld() {
  return held;
}
