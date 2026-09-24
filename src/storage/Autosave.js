/**
 * The condition that makes the periodic autosave write. There are two
 * triggers, and each needs unsaved changes to exist. The GM has paused
 * editing (no mutation during the idle window), or changes have sat unsaved
 * past the hard cap even though editing never paused. This bounds data loss
 * during nonstop editing. The function is pure, so a unit test can check the
 * policy apart from the timer that polls it.
 */

/** How long editing must be quiet before an autosave fires. */
export const AUTOSAVE_IDLE_MS = 10_000;

/** The longest changes may sit unsaved, even during nonstop editing. */
export const AUTOSAVE_MAX_WAIT_MS = 120_000;

/** How often the autosave timer polls this policy. */
export const AUTOSAVE_POLL_MS = 5_000;

/**
 * @param {{ dirty: boolean, now: number, lastMutationAt: number, dirtySince: number }} args
 *   `lastMutationAt` is the time of the most recent mutation. `dirtySince` is
 *   the time the campaign first became dirty after the last save.
 * @returns {boolean}
 */
export function shouldAutosave({ dirty, now, lastMutationAt, dirtySince }) {
  if (!dirty) return false;
  return now - lastMutationAt >= AUTOSAVE_IDLE_MS || now - dirtySince >= AUTOSAVE_MAX_WAIT_MS;
}

/**
 * Whether another tab has written the campaign since this tab last matched
 * storage. `held` is the save string this tab loaded, wrote, or adopted.
 * `stored` is the save string in storage now. An automatic write (autosave,
 * or the combat flush) stops while this is true, so a tab that has not
 * adopted another tab's save cannot write its older copy over it. A GM who
 * declines the reload prompt, or a player tab that is mid-roll when the GM
 * saves, then keeps its changes in memory until an explicit Save. Nothing
 * stored means there is nothing to overwrite.
 * @param {string | null} held
 * @param {string | null} stored
 * @returns {boolean}
 */
export function storageMovedOn(held, stored) {
  return stored !== null && stored !== held;
}
