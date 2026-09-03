import { el } from './dom.js';
import { entryItem } from './TravelogPanel.js';
import { entriesAfter, TRAVELOG_LIMIT } from '../log/Travelogue.js';

/** @typedef {import('../types/log.js').LogEntry} LogEntry */

/**
 * The combat screen's log column: the fight's slice of the travelogue,
 * newest on top. The list is a `role="log"` live region, so a screen reader
 * speaks each new row as it lands, and only the new rows. That only works
 * when the rows already read are left alone. `update` therefore adds only
 * the entries logged since the last call, through `entriesAfter`, and
 * rebuilds from scratch only when the log was cleared or replaced. The
 * travelogue panel renders the same way.
 * @returns {{
 *   element: HTMLElement,
 *   update: (entries: LogEntry[]) => void,
 *   clear: () => void,
 * }}
 */
export function mountCombatLog() {
  const list = el('ul', 'combat-log__list travelog__list u-col u-g1');
  list.setAttribute('role', 'log');
  const empty = el('p', 'u-muted', 'Nothing logged yet.');
  const element = el(
    'section',
    'combat-log',
    el('h3', 'combat-board__heading', 'Combat log'),
    empty,
    list,
  );

  /** Id of the newest rendered entry. Null when the list renders empty. */
  let newestId = /** @type {string | null} */ (null);

  /** @param {LogEntry[]} entries oldest first, as the travelogue stores them */
  function update(entries) {
    const fresh = entriesAfter(entries, newestId);
    if (fresh === null) list.textContent = ''; // cleared or replaced, so rebuild
    // Show the list before the rows land. A live region hidden at the moment
    // of the change is not read aloud.
    if (entries.length > 0) {
      list.hidden = false;
      empty.hidden = true;
    }
    // The list is newest first. Prepending in oldest-to-newest order leaves
    // the newest row on top.
    for (const entry of fresh ?? entries) list.prepend(entryItem(entry));
    while (list.children.length > TRAVELOG_LIMIT) list.lastElementChild?.remove();
    const hasRows = list.children.length > 0;
    empty.hidden = hasRows;
    list.hidden = !hasRows;
    newestId = entries.length ? entries[entries.length - 1].id : null;
  }

  /** Empty the column between fights. The next fight starts from scratch. */
  function clear() {
    list.textContent = '';
    list.hidden = true;
    empty.hidden = false;
    newestId = null;
  }

  clear();
  return { element, update, clear };
}
