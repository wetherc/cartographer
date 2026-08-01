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
