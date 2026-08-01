import { el } from './dom.js';

/**
 * Mount a toast stack: small transient status messages that confirm
 * actions, for example Save, Export, or Undo, that otherwise succeed
 * silently. The stack is a polite live region, so screen readers announce
 * each message without taking focus. A message auto-dismisses. A click on
 * a message dismisses it early.
 * @param {HTMLElement} container
 * @param {{ duration?: number }} [options]
 * @returns {{ show: (message: string) => void }}
 */
export function mountToasts(container, options = {}) {
  const duration = options.duration ?? 3500;
  const root = el('div', 'toast-stack u-col u-g2');
  root.setAttribute('role', 'status');
  root.setAttribute('aria-live', 'polite');
  container.appendChild(root);

  /** @param {string} message */
  function show(message) {
    const toast = el('div', 'toast', message);
    const dismiss = () => {
      toast.classList.add('toast--leaving');
      // This matches the CSS fade-out duration. Remove the toast after the fade completes.
      setTimeout(() => toast.remove(), 250);
    };
    toast.addEventListener('click', dismiss);
    root.appendChild(toast);
    setTimeout(dismiss, duration);
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
