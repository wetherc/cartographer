/**
 * Focus that survives a panel rebuild.
 *
 * Several panels rebuild by clearing their root and building every row
 * again. Focus sits on an element inside that root, so the clear moves
 * focus to the document body. A GM who tabs to a control loses the
 * keyboard position. A cross-tab save adoption rebuilds the same panels
 * every few seconds, so the loss happens without any local action.
 *
 * This module notes where focus was before the clear and puts it back
 * after. It identifies a control by a signature instead of by position,
 * because the rebuilt element is a different object at a possibly
 * different index. The signature is the tag name, the input type, the
 * class, and the accessible name. Panel controls label themselves with
 * the name of their row, for example "Damage Goblin Scout", so the
 * signature is unique per row. An unlabeled control falls back to its
 * index among the controls that share its signature.
 *
 * A signature that no longer exists restores nothing. This is the case
 * where the row went away, and the old behavior is the correct one.
 *
 * The functions read only `tagName`, `className`, `getAttribute`,
 * `textContent`, `contains`, `querySelectorAll`, and `focus`, so a test
 * can pass stub nodes.
 */

/** Controls that can hold focus inside a panel. */
const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]';

/** Input types whose caret position can be read and written. */
const CARET_TYPES = new Set(['text', 'search', 'url', 'tel', 'password']);

/**
 * @typedef {object} FocusMemo
 * @property {string} signature
 * @property {number} index among the controls that share the signature.
 * @property {number} [selectionStart]
 * @property {number} [selectionEnd]
 */

/**
 * The focusable controls inside a root, in document order.
 * @param {HTMLElement} root
 * @returns {HTMLElement[]}
 */
function focusables(root) {
  return /** @type {HTMLElement[]} */ ([...root.querySelectorAll(FOCUSABLE)]);
}

/**
 * Whether a caret position can be read from and written to this control.
 * A number input throws on `setSelectionRange`, so it is excluded.
 * @param {HTMLElement} node
 * @returns {boolean}
 */
function hasCaret(node) {
  if (node.tagName === 'TEXTAREA') return true;
  if (node.tagName !== 'INPUT') return false;
  return CARET_TYPES.has(node.getAttribute('type') ?? 'text');
}

/**
 * What identifies one control across a rebuild.
 * @param {HTMLElement} node
 * @returns {string}
 */
export function controlSignature(node) {
  const label =
    node.getAttribute('aria-label') ??
    node.getAttribute('title') ??
    (node.textContent ?? '').trim().slice(0, 60);
  return [node.tagName, node.getAttribute('type') ?? '', String(node.className ?? ''), label].join(
    '|',
  );
}

/**
 * Note where focus is, before a rebuild clears the root. Returns null
 * when focus is somewhere else, which is the common case.
 * @param {HTMLElement} root
 * @param {Element | null} active usually `document.activeElement`.
 * @returns {FocusMemo | null}
 */
export function captureFocus(root, active) {
  if (!active || active === root || !root.contains(active)) return null;
  const node = /** @type {HTMLElement} */ (active);
  const signature = controlSignature(node);
  const index = focusables(root)
    .filter((other) => controlSignature(other) === signature)
    .indexOf(node);
  if (index < 0) return null;
  /** @type {FocusMemo} */
  const memo = { signature, index };
  if (hasCaret(node)) {
    const input = /** @type {HTMLInputElement} */ (node);
    if (input.selectionStart !== null) {
      memo.selectionStart = input.selectionStart;
      memo.selectionEnd = input.selectionEnd ?? input.selectionStart;
    }
  }
  return memo;
}

/**
 * Put focus back on the rebuilt control the memo describes. Returns
 * whether it found one.
 * @param {HTMLElement} root
 * @param {FocusMemo | null} memo
 * @returns {boolean}
 */
export function restoreFocus(root, memo) {
  if (!memo) return false;
  const again = focusables(root).filter((node) => controlSignature(node) === memo.signature)[
    memo.index
  ];
  if (!again) return false;
  again.focus();
  if (memo.selectionStart !== undefined && hasCaret(again)) {
    /** @type {HTMLInputElement} */ (again).setSelectionRange(
      memo.selectionStart,
      memo.selectionEnd ?? memo.selectionStart,
    );
  }
  return true;
}
