/**
 * Call `onChange` each time the device pixel ratio changes, for example when
 * the window moves from a 2x screen to a 1x projector. A ResizeObserver does
 * not fire then, because the CSS size of the element stays the same, so a
 * canvas buffer sized from the old ratio would draw text at the wrong size.
 *
 * A `(resolution: Xdppx)` query matches one ratio only. The watcher listens
 * for the query of the current ratio to stop matching, then arms a new query
 * for the new ratio. The arguments default to the browser globals, so a test
 * can pass stubs.
 * @param {() => void} onChange
 * @param {{
 *   matchMedia?: (query: string) => Pick<MediaQueryList, 'addEventListener' | 'removeEventListener'>,
 *   ratio?: () => number,
 * }} [env]
 * @returns {() => void} stops the watch
 */
export function watchPixelRatio(onChange, env = {}) {
  const match = env.matchMedia ?? ((query) => window.matchMedia(query));
  const ratio = env.ratio ?? (() => window.devicePixelRatio || 1);
  /** @type {(() => void) | null} */
  let disarm = null;
  const arm = () => {
    const query = match(`(resolution: ${ratio()}dppx)`);
    const listener = () => {
      disarm?.();
      arm();
      onChange();
    };
    query.addEventListener('change', listener, { once: true });
    disarm = () => query.removeEventListener('change', listener);
  };
  arm();
  return () => disarm?.();
}
