import { textButton, emptyState } from './buttons.js';
import { entriesAfter, TRAVELOG_LIMIT } from '../log/Travelogue.js';

/** @typedef {import('../types/log.js').LogEntry} LogEntry */

/** Format an entry's epoch-ms timestamp as a local HH:MM readout.
 * @param {number} at */
function formatTime(at) {
  return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Build the list row for one entry.
 * @param {LogEntry} entry */
function entryItem(entry) {
  const item = document.createElement('li');
  item.className = `travelog__item travelog__item--${entry.kind}`;

  const time = document.createElement('time');
  time.className = 'travelog__time';
  time.dateTime = new Date(entry.at).toISOString();
  time.textContent = formatTime(entry.at);

  const message = document.createElement('span');
  message.className = 'travelog__message';
  message.textContent = entry.message;

  item.append(time, message);
  return item;
}

/**
 * Mount the travelogue panel: a newest-first list of auto-recorded events
 * (party movement, combat outcomes) with a Clear control. The panel owns no
 * state — `getEntries` supplies the rows and `onClear` empties the master list
 * kept by the caller, matching the other thin DOM-wrapper panels. Rendering is
 * append-only: `update` prepends only the entries logged since the last call
 * (via `entriesAfter`) and rebuilds from scratch only when the log was cleared
 * or replaced, so a `logEvent` costs one row, not a full re-render.
 * @param {HTMLElement} container
 * @param {{ getEntries: () => LogEntry[], onClear: () => Promise<boolean> | boolean }} callbacks
 * @returns {{ update: () => void }}
 */
export function mountTravelogPanel(container, callbacks) {
  const root = document.createElement('div');
  root.className = 'travelog';

  const empty = emptyState('No events logged yet.');

  const list = document.createElement('ul');
  list.className = 'travelog__list';

  const clearButton = textButton(
    'Clear log',
    async () => {
      if (await callbacks.onClear()) update();
    },
    { icon: 'remove', variant: 'danger', className: 'travelog__clear' },
  );

  root.append(empty, list, clearButton);
  container.appendChild(root);

  /** Id of the newest rendered entry; null when the list renders empty. */
  let newestId = /** @type {string | null} */ (null);

  function update() {
    const entries = callbacks.getEntries();
    const fresh = entriesAfter(entries, newestId);
    if (fresh === null) list.textContent = ''; // cleared or replaced: rebuild
    // Newest first: prepending oldest-to-new leaves the newest row on top.
    for (const entry of fresh ?? entries) list.prepend(entryItem(entry));
    while (list.children.length > TRAVELOG_LIMIT) list.lastElementChild?.remove();

    const hasEntries = list.children.length > 0;
    empty.hidden = hasEntries;
    list.hidden = !hasEntries;
    clearButton.hidden = !hasEntries;
    newestId = entries.length ? entries[entries.length - 1].id : null;
  }

  update();
  return { update };
}
