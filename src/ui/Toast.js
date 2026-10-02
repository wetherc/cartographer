import { bareButton } from './buttons.js';
import { el } from './dom.js';
import { toastPlace } from '../view/ToastPlace.js';

/** @typedef {'status' | 'error'} ToastLevel */
/**
 * @typedef {{ level?: ToastLevel, action?: { label: string, onClick: () => void } }} ToastOptions
 */

/**
 * Mount a toast stack: small transient messages that confirm actions, for
 * example Save, Export, or Undo, that otherwise succeed silently. The stack
 * holds two live regions. A status toast (the default) goes into a polite
 * region, so a screen reader announces it without an interruption, and it
 * dismisses itself after a few seconds. An error toast (`level: 'error'`)
 * goes into an assertive `role="alert"` region, so a failed import or a
 * full storage is announced at once and is not lost behind whatever the
 * reader was saying. An error stays four times as long, and carries a
 * Dismiss button so a keyboard user can close it early. A click on any
 * toast dismisses it early. A toast with an `action` shows one button that
 * runs the action and dismisses the toast. It stays as long as an error, so
 * the GM has time to use the button.
 *
 * `anchor` names the row whose right end the stack lines up with when the
 * first toast of a batch appears. The stack keeps clear of the row's
 * contents: when they leave no room at the right end, the stack goes below
 * the row (see view/ToastPlace.js). Without an anchor, or while it is out of
 * view, the stack stays in its CSS place. `follow` names the elements whose
 * change of size moves or hides the anchor, such as the header when its
 * phone menu opens, or the breadcrumb row when a phone view hides it. While
 * a toast shows, the stack places itself again after each such change, so it
 * does not stay over the buttons of the open menu or of the new view.
 * @param {HTMLElement} container
 * @param {{ duration?: number, anchor?: () => Element | null, follow?: (Element | null)[] }} [options]
 * @returns {{ show: (message: string, options?: ToastOptions) => void }}
 */
export function mountToasts(container, options = {}) {
  const duration = options.duration ?? 3500;
  const root = el('div', 'toast-stack u-col u-g2');
  const status = el('div', 'toast-stack__region u-col u-g2');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const alert = el('div', 'toast-stack__region u-col u-g2');
  alert.setAttribute('role', 'alert');
  alert.setAttribute('aria-live', 'assertive');
  root.append(status, alert);
  container.appendChild(root);

  /**
   * Line the stack up with the anchor, or give it back to the stylesheet.
   * This runs after the first toast of a batch is in the stack, so the
   * stack has its width.
   */
  function placeStack() {
    const anchor = options.anchor?.();
    let place = null;
    if (anchor) {
      const contents = document.createRange();
      contents.selectNodeContents(anchor);
      const trailRight = anchor.childElementCount ? contents.getBoundingClientRect().right : 0;
      const box = anchor.getBoundingClientRect();
      place = toastPlace(box, trailRight, root.offsetWidth, window.innerWidth, window.innerHeight);
    }
    root.style.top = place ? `${place.top}px` : '';
    // The CSS place is at the bottom. A place from the anchor is at the top.
    root.style.bottom = place ? 'auto' : '';
    root.style.right = place ? `${place.right}px` : '';
  }

  if (options.follow && typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(() => {
      if (root.querySelector('.toast')) placeStack();
    });
    for (const element of options.follow) if (element) observer.observe(element);
  }

  /**
   * @param {string} message
   * @param {ToastOptions} [opts]
   */
  function show(message, opts = {}) {
    const first = !root.querySelector('.toast');
    const error = opts.level === 'error';
    const kind = error ? ' toast--error' : opts.action ? ' toast--action' : '';
    const toast = el('div', `toast${kind}`, message);
    const dismiss = () => {
      toast.classList.add('toast--leaving');
      // This matches the CSS fade-out duration. Remove the toast after the fade completes.
      setTimeout(() => toast.remove(), 250);
    };
    toast.addEventListener('click', dismiss);
    const { action } = opts;
    if (action) {
      toast.appendChild(
        bareButton([action.label], action.onClick, { className: 'toast__dismiss' }),
      );
    } else if (error) {
      toast.appendChild(bareButton(['Dismiss'], dismiss, { className: 'toast__dismiss' }));
    }
    (error ? alert : status).appendChild(toast);
    if (first) placeStack();
    setTimeout(dismiss, error || action ? duration * 4 : duration);
  }

  return { show };
}

const PENDING_KEY = 'campaign-builder:pending-toast';

/**
 * Queue a toast to show after the next page load. Use this for actions,
 * for example Undo, Import, or campaign replacement, that reload the page
 * and otherwise lose their own confirmation. sessionStorage keeps
 * the toast tab-local.
 * @param {string} message
 */
export function queueToastAfterReload(message) {
  sessionStorage.setItem(PENDING_KEY, message);
}

/**
 * Show and clear any toast queued before a reload. Call once on boot.
 * @param {{ show: (message: string) => void }} toasts
 */
export function flushQueuedToast(toasts) {
  const pending = sessionStorage.getItem(PENDING_KEY);
  if (!pending) return;
  sessionStorage.removeItem(PENDING_KEY);
  toasts.show(pending);
}
