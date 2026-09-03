import { bareButton } from './buttons.js';
import { el } from './dom.js';

/** @typedef {'status' | 'error'} ToastLevel */
/** @typedef {{ level?: ToastLevel }} ToastOptions */

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
 * toast dismisses it early.
 * @param {HTMLElement} container
 * @param {{ duration?: number }} [options]
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
   * @param {string} message
   * @param {ToastOptions} [opts]
   */
  function show(message, opts = {}) {
    const error = opts.level === 'error';
    const toast = el('div', error ? 'toast toast--error' : 'toast', message);
    const dismiss = () => {
      toast.classList.add('toast--leaving');
      // This matches the CSS fade-out duration. Remove the toast after the fade completes.
      setTimeout(() => toast.remove(), 250);
    };
    toast.addEventListener('click', dismiss);
    if (error) {
      toast.appendChild(bareButton(['Dismiss'], dismiss, { className: 'toast__dismiss' }));
    }
    (error ? alert : status).appendChild(toast);
    setTimeout(dismiss, error ? duration * 4 : duration);
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
