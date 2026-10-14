/**
 * The part of an `IdleDeadline` that the callers here read.
 * @typedef {{ timeRemaining: () => number }} IdleBudget
 */

/**
 * How long the timer fallback lets one callback run, in milliseconds. It is
 * half of a 60 Hz frame, so a run of chunks leaves room for input and paint.
 */
const FALLBACK_BUDGET_MS = 8;

/**
 * Run work once the browser has nothing else to do. `requestIdleCallback`
 * does this where it exists. Safari does not have it, so a timer stands in.
 * The timer is not an idle callback: it only keeps the work off the current
 * task, which is enough for the callers here. The work gets the idle
 * deadline, or under the timer a budget of FALLBACK_BUDGET_MS from the start
 * of the callback.
 *
 * A caller of this function must be work the app can skip. Nothing waits for
 * the callback, and a page that closes first never runs it.
 * @param {(deadline: IdleBudget) => void} work
 * @param {number} [timeout] milliseconds to wait at the most
 * @returns {void}
 */
export function onIdle(work, timeout = 2000) {
  const idle = /** @type {any} */ (globalThis).requestIdleCallback;
  if (typeof idle === 'function') {
    idle(work, { timeout });
    return;
  }
  setTimeout(() => {
    const end = performance.now() + FALLBACK_BUDGET_MS;
    work({ timeRemaining: () => Math.max(0, end - performance.now()) });
  }, 0);
}

/**
 * Run a list of small steps across as many idle callbacks as they need. Each
 * callback runs steps while more than `reserve` milliseconds of its deadline
 * remain, then asks for another callback. A callback always runs at least one
 * step, because a deadline that fires on its timeout has no time left, and a
 * run that waited for time would never finish on a busy page. One long step
 * list in a single callback blocks input for as long as it runs.
 * @param {(() => unknown)[]} steps
 * @param {{ timeout?: number, reserve?: number }} [options]
 * @returns {void}
 */
export function runStepsWhenIdle(steps, { timeout = 2000, reserve = 2 } = {}) {
  let next = 0;
  /** @param {IdleBudget} deadline */
  const run = (deadline) => {
    do {
      steps[next]();
      next += 1;
    } while (next < steps.length && deadline.timeRemaining() > reserve);
    if (next < steps.length) onIdle(run, timeout);
  };
  if (steps.length) onIdle(run, timeout);
}
