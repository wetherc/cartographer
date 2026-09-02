/**
 * The two decisions `openDialog` makes without touching the DOM: which id a
 * dialog's heading and message get, and where focus goes when the dialog
 * closes. Both live here so a unit test can check them with plain objects.
 */

let counter = 0;

/**
 * A document-unique id for one dialog part. Each dialog gets its own heading
 * id, so `aria-labelledby` on the dialog points at one element even when two
 * dialogs are open at once.
 * @param {string} part `title` or `message`
 * @returns {string}
 */
export function dialogPartId(part) {
  counter += 1;
  return `dialog-${part}-${counter}`;
}

/**
 * The element that takes focus after a dialog closes. The opener comes
 * first, then the caller's fallback, then the page's main landmark. A
 * candidate is skipped when it is missing or no longer in the document: a
 * dialog often removes or rebuilds the control that opened it, and focusing
 * a detached element silently drops focus onto `<body>`. When every
 * candidate is gone, the result is null and the caller leaves focus alone.
 * @param {Array<{ isConnected: boolean } | null | undefined>} candidates
 * @returns {{ isConnected: boolean } | null}
 */
export function pickReturnFocus(candidates) {
  return candidates.find((candidate) => candidate?.isConnected) ?? null;
}
