/**
 * The decisions `openDialog` makes without touching the DOM: which id a
 * dialog's heading and message get, and where focus goes when the dialog
 * closes. They live here so a unit test can check them with plain objects.
 */

import { uniqueId } from './dom.js';
import { captureFocus, restoreFocus } from './focusMemory.js';

/**
 * A document-unique id for one dialog part. Each dialog gets its own heading
 * id, so `aria-labelledby` on the dialog points at one element even when two
 * dialogs are open at once.
 * @param {string} part `title` or `message`
 * @returns {string}
 */
export function dialogPartId(part) {
  return uniqueId(`dialog-${part}`);
}

/**
 * The element that takes focus after a dialog closes. `openDialog` passes
 * the caller's `returnFocus` first, then the opener, then the page's main
 * landmark. A
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

/**
 * @typedef {object} FocusNote
 * @property {HTMLElement | null} opener the control that opened the dialog.
 * @property {import('./focusMemory.js').FocusMemo | null} memo the opener's
 *   signature among the controls of the page.
 * @property {HTMLElement[]} ancestors the opener's ancestors, nearest first.
 */

/**
 * Note the opener of a dialog before the caller rebuilds the list that
 * contains it. A caller often re-renders its panel after the dialog
 * resolves, which removes the opener, so `repairFocus` later finds the
 * rebuilt control by its signature.
 * @param {HTMLElement | null} opener
 * @param {HTMLElement} root usually `document.body`.
 * @returns {FocusNote}
 */
export function noteFocus(opener, root) {
  /** @type {HTMLElement[]} */
  const ancestors = [];
  for (let node = opener?.parentElement ?? null; node && node !== root; node = node.parentElement)
    ancestors.push(node);
  return { opener, memo: opener ? captureFocus(root, opener) : null, ancestors };
}

/**
 * Put focus back after a dialog closed and its caller re-rendered. Focus
 * that sits on a live element other than the body stays where it is, since
 * the caller moved it on purpose. Otherwise the order is the opener when
 * still in the page, the rebuilt control with the opener's signature, the
 * first control inside the nearest ancestor still in the page, and the
 * fallback (the main landmark). Returns the element that took focus, or
 * null when focus stayed put or nothing could take it.
 * @param {{ activeElement: Element | null, body: HTMLElement }} doc
 * @param {FocusNote} note
 * @param {HTMLElement | null} fallback
 * @returns {HTMLElement | null}
 */
export function repairFocus(doc, note, fallback) {
  const held = () => {
    const active = doc.activeElement;
    return active && active !== doc.body && active.isConnected ? active : null;
  };
  if (held()) return null;
  /** @param {HTMLElement | null | undefined} node */
  const tryFocus = (node) => {
    if (!node?.isConnected) return null;
    node.focus();
    return held() === node ? node : null;
  };
  const opener = tryFocus(note.opener);
  if (opener) return opener;
  if (restoreFocus(doc.body, note.memo) && held()) return /** @type {HTMLElement} */ (held());
  const home = note.ancestors.find((node) => node.isConnected);
  const first = home?.querySelector?.('a[href], button, input, select, textarea, [tabindex]');
  return tryFocus(/** @type {HTMLElement | null} */ (first ?? null)) ?? tryFocus(fallback);
}
