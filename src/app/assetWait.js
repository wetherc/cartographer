/**
 * The saves that wait on an image put.
 *
 * A save that adds an image returns `pending` and writes nothing
 * (`storage/AssetMirror.js`). The caller runs the same action again when
 * the put settles, and that run writes the campaign. While a put is
 * pending, an automatic write has nothing to do, because the action that
 * waits writes the latest state once it runs again.
 */

/**
 * @returns {{ waiting: () => boolean, after: (pending: Promise<boolean> | undefined, again: () => void) => boolean }}
 */
export function createAssetWait() {
  /** @type {Set<Promise<boolean>>} */
  const open = new Set();
  return {
    /** True while some save waits on a put. */
    waiting: () => open.size > 0,
    /**
     * Run `again` once `pending` settles, and return true. With no
     * `pending`, do nothing and return false, so the caller goes on with
     * the result it has.
     */
    after(pending, again) {
      if (!pending) return false;
      open.add(pending);
      void pending.then(() => {
        open.delete(pending);
        again();
      });
      return true;
    },
  };
}
