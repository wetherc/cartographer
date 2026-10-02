import { textButton, emptyState } from './buttons.js';
import { el } from './dom.js';
import { entriesAfter, isoTimestamp, stampLabel, TRAVELOG_LIMIT } from '../log/Travelogue.js';

/** @typedef {import('../types/log.js').LogEntry} LogEntry */

/** One formatter for every row. A new `toLocaleTimeString` call builds a
 * formatter each time, which costs about 6 ms across a 200-row log. */
const TIME_FORMAT = new Intl.DateTimeFormat([], { hour: '2-digit', minute: '2-digit' });

/** Format an entry's epoch-ms timestamp as a local HH:MM readout. The shared
 * formatter throws on an invalid date, so that case reads "Invalid Date".
 * This text matches what `toLocaleTimeString` gives.
 * @param {number} at @param {string | null} iso the timestamp from `isoTimestamp` */
function formatTime(at, iso) {
  return iso === null ? 'Invalid Date' : TIME_FORMAT.format(at);
}

/** Build the list row for one entry. Shared with the combat screen's log
 * column. The row shows the in-game time (see `stampLabel`), and the
 * wall-clock time goes in the tooltip. An entry with no in-game stamp shows
 * the wall-clock time.
 * @param {LogEntry} entry
 * @param {boolean} [withRound] show "Round N" alone for a fight line
 */
export function entryItem(entry, withRound = false) {
  // A timestamp that is not a date gets no machine-readable attribute.
  const iso = isoTimestamp(entry.at);
  const wall = formatTime(entry.at, iso);
  const time = el('time', 'travelog__time', stampLabel(entry, withRound) ?? wall);
  if (iso !== null) time.dateTime = iso;
  if (time.textContent !== wall) time.title = wall;

  return el(
    'li',
    `travelog__item travelog__item--${entry.kind}`,
    time,
    el('span', 'travelog__message', entry.message),
  );
}

/**
 * Mount the travelogue panel: a newest-first list of auto-recorded
 * events, for example party movement or combat outcomes, with a Clear
 * control. The panel owns no state. `getEntries` supplies the rows, and
 * `onClear` empties the master list kept by the caller, matching the
 * other thin DOM-wrapper panels. Rendering is append-only. `update`
 * prepends only the entries logged since the last call, through
 * `entriesAfter`, and rebuilds from scratch only when the log was cleared
 * or replaced. A `logEvent` costs one row, not a full rerender. A change of
 * `getRole` also rebuilds the list, because the two roles read different
 * lines (see `LogVisibility.entriesFor`).
 * @param {HTMLElement} container
 * @param {{ getEntries: () => LogEntry[], onClear: () => Promise<boolean> | boolean, getRole?: () => string }} callbacks
 * @returns {{ update: () => void }}
 */
export function mountTravelogPanel(container, callbacks) {
  const empty = emptyState('No events logged yet.');

  const list = el('ul', 'travelog__list u-col u-g1');

  const clearButton = textButton(
    'Clear log',
    async () => {
      if (await callbacks.onClear()) update();
    },
    { icon: 'remove', variant: 'danger', className: 'travelog__clear' },
  );

  container.appendChild(el('div', 'travelog', empty, list, clearButton));

  /** Id of the newest rendered entry. Null when the list renders empty. */
  let newestId = /** @type {string | null} */ (null);
  /** The role the rendered rows were written for. */
  let shownRole = callbacks.getRole?.() ?? '';

  function update() {
    const entries = callbacks.getEntries();
    const role = callbacks.getRole?.() ?? '';
    const rebuild = role !== shownRole;
    shownRole = role;
    const fresh = rebuild ? null : entriesAfter(entries, newestId);
    if (fresh === null) list.textContent = ''; // the log was cleared or replaced, so rebuild
    // The list is newest first. Prepending in oldest-to-newest order
    // leaves the newest row on top.
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
