/**
 * Mount a toast stack: small transient status messages confirming actions
 * (Save, Export, Undo, ...) that otherwise succeed silently. The stack is a
 * polite live region, so screen readers announce each message without focus
 * theft. Messages auto-dismiss; clicking one dismisses it early.
 * @param {HTMLElement} container
 * @param {{ duration?: number }} [options]
 * @returns {{ show: (message: string) => void }}
 */
export function mountToasts(container, options = {}) {
  const duration = options.duration ?? 3500;
  const root = document.createElement('div');
  root.className = 'toast-stack';
  root.setAttribute('role', 'status');
  root.setAttribute('aria-live', 'polite');
  container.appendChild(root);

  /** @param {string} message */
  function show(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    const dismiss = () => {
      toast.classList.add('toast--leaving');
      // Matches the CSS fade-out duration; remove after it completes.
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
 * Queue a toast to show after the next page load — for actions (Undo, Import,
 * campaign replacement) that reload the page and would otherwise eat their own
 * confirmation. sessionStorage keeps it tab-local.
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
