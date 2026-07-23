/**
 * When the periodic autosave should actually write. Two triggers, both
 * requiring unsaved changes: the GM has paused editing (no mutation for the
 * idle window), or changes have been sitting unsaved past the hard cap even
 * though editing never paused — so nonstop editing still bounds data loss.
 * Pure, so the policy is unit-testable apart from the timer that polls it.
 */

/** How long editing must be quiet before an autosave fires. */
export const AUTOSAVE_IDLE_MS = 10_000;

/** The longest changes may sit unsaved, even during nonstop editing. */
export const AUTOSAVE_MAX_WAIT_MS = 120_000;

/** How often the autosave timer polls this policy. */
export const AUTOSAVE_POLL_MS = 5_000;

/**
 * @param {{ dirty: boolean, now: number, lastMutationAt: number, dirtySince: number }} args
 *   `lastMutationAt` is the time of the most recent mutation; `dirtySince` the
 *   time the campaign first became dirty after the last save.
 * @returns {boolean}
 */
export function shouldAutosave({ dirty, now, lastMutationAt, dirtySince }) {
  if (!dirty) return false;
  return now - lastMutationAt >= AUTOSAVE_IDLE_MS || now - dirtySince >= AUTOSAVE_MAX_WAIT_MS;
}
