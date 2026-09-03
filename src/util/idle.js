/**
 * Run work once the browser has nothing else to do. `requestIdleCallback`
 * does this where it exists. Safari does not have it, so a timer stands in.
 * The timer is not an idle callback: it only keeps the work off the current
 * task, which is enough for the callers here.
 *
 * A caller of this function must be work the app can skip. Nothing waits for
 * the callback, and a page that closes first never runs it.
 * @param {() => void} work
 * @param {number} [timeout] milliseconds to wait at the most
 * @returns {void}
 */
export function onIdle(work, timeout = 2000) {
  const idle = /** @type {any} */ (globalThis).requestIdleCallback;
  if (typeof idle === 'function') idle(work, { timeout });
  else setTimeout(work, 0);
}
