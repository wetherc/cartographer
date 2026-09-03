/**
 * One refresh for a whole burst of writes. Every write path in a fight asks
 * for a refresh. The first request in a synchronous burst schedules the run.
 * Every request after it, until the run happens, does nothing. One weapon
 * attack spends the budget, logs the roll, logs the damage, writes the
 * target, and logs a defeat. Each of those used to rebuild the combat screen.
 * With this scheduler they cost one rebuild.
 *
 * `schedule` defaults to a microtask. A microtask runs after the current
 * handler finishes and before the browser paints, so the screen never shows a
 * frame between the writes of one burst. A test passes its own scheduler and
 * runs the flush by hand.
 * @param {() => void} run the refresh itself
 * @param {(flush: () => void) => void} [schedule]
 * @returns {{ request: () => void, isPending: () => boolean }}
 */
export function createRefreshScheduler(run, schedule = queueMicrotask) {
  let pending = false;
  return {
    request() {
      if (pending) return;
      pending = true;
      schedule(() => {
        // Clear the flag before the run, so a request made during the run
        // schedules the next one instead of being lost.
        pending = false;
        run();
      });
    },
    isPending: () => pending,
  };
}
