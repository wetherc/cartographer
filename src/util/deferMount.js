/**
 * Wrap the mount of a panel so that it runs on the first call to `mount`
 * instead of at startup. Until then, `update` does nothing, so code that
 * refreshes the panel on every change does not need to know whether it
 * exists. A panel that mounts later reads the current state when it first
 * paints.
 * @template {{ update: () => void }} T
 * @param {() => T} mountFn builds the panel
 * @returns {{ mount: () => T, update: () => void, readonly mounted: boolean }}
 */
export function deferMount(mountFn) {
  /** @type {T | null} */
  let view = null;
  return {
    mount: () => (view ??= mountFn()),
    update: () => view?.update(),
    get mounted() {
      return view !== null;
    },
  };
}
