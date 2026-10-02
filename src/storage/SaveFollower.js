/**
 * The cross-tab save detector that a follower tab runs on `storage` events.
 *
 * A save from another tab is a bundle of writes: the campaign key, then the
 * undo history (a delta record and the index), then the save mark. The
 * browser delivers one `storage` event per write, in write order, and it
 * updates this tab's view of storage one event at a time. At the event for
 * the campaign key, the history index still names the step before this
 * save. A follower that plans its adoption from the index at that moment
 * applies the previous save's delta and shows every change one save late.
 *
 * The follower therefore acts on the save mark, the last write of every
 * bundle, and so reads the history that matches the campaign. A mark write
 * can fail on a full origin, so the campaign-key event also starts a
 * fallback timer. When no mark arrives before it expires, the follower acts
 * anyway, with the history it can see. The timer and the clock are
 * arguments, so a test can drive both.
 */

/**
 * @typedef {{ key: string | null, newValue: string | null, oldValue: string | null }} StorageChange
 */

/**
 * How long a follower waits for the save mark after the campaign-key event.
 * Both events come from the same task in the writing tab, so the mark
 * normally arrives within a few milliseconds.
 */
export const SAVE_MARK_WAIT_MS = 1000;

/**
 * @param {{
 *   saveKey: string,
 *   markKey: string,
 *   onSave: () => void,
 *   setTimer: (fn: () => void, ms: number) => unknown,
 *   clearTimer: (handle: unknown) => void,
 * }} options
 * @returns {(event: StorageChange) => void} the `storage` event handler
 */
export function createSaveFollower({ saveKey, markKey, onSave, setTimer, clearTimer }) {
  /** The fallback timer of a campaign write that has no mark yet. @type {unknown} */
  let pending = null;

  function settle() {
    if (pending === null) return;
    clearTimer(pending);
    pending = null;
    onSave();
  }

  return (event) => {
    if (event.newValue === null || event.newValue === event.oldValue) return;
    if (event.key === saveKey) {
      if (pending === null) pending = setTimer(settle, SAVE_MARK_WAIT_MS);
    } else if (event.key === markKey) {
      settle();
    }
  };
}
