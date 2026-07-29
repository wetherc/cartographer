import { textButton } from './buttons.js';
import { el } from './dom.js';
import { textField } from './formFields.js';
import { mountListPanel } from './listPanel.js';
import { buildTabs } from './Tabs.js';

/** @typedef {import('../types/library.js').LibrarySource} LibrarySource */

/**
 * @typedef {{
 *   key: string,
 *   name: string,
 *   summary: string,
 *   source: LibrarySource,
 *   group?: string,
 * }} LibraryRow
 */

/**
 * Mount one Library-rail list (equipment, bestiary, or NPC templates): every
 * built-in default plus the GM's overrides and additions, each row tagged by
 * source. Editing goes through either `buildEditor` (an inline form rendered
 * in place of the list, the item form's home turf) or `onEdit` (a modal
 * dialog); overrides and customs get a remove button that reverts or deletes.
 *
 * Owns no library state: `getEntries` supplies the rows and every mutation
 * flows back through a callback, matching the other panels. When `subtabs`
 * are given, a tab strip above the filter narrows the list to one subtab at a
 * time and `getEntries` receives the active subtab's id.
 *
 * The add button, the tab strip, and the filter input are built once and stay
 * put; only the lists redraw. That is what lets a keystroke in the filter
 * re-run the search without rebuilding the input the GM is typing into.
 * @param {HTMLElement} container
 * @param {{
 *   getEntries: (subtab?: string) => LibraryRow[],
 *   subtabs?: { id: string, label: string }[],
 *   addLabel: string,
 *   onAdd?: () => Promise<unknown>,
 *   onEdit?: (key: string) => Promise<unknown>,
 *   buildEditor?: (key: string | null, close: () => void) => HTMLElement,
 *   onRemove: (key: string, source: LibrarySource) => Promise<unknown>,
 *   onSpawn?: (key: string) => void,
 *   spawnLabel?: string,
 * }} callbacks
 * @returns {{ update: () => void }}
 */
export function mountLibraryPanel(container, callbacks) {
  const root = el('div', 'library-panel');
  container.appendChild(root);

  /** Case-insensitive name filter, kept across re-renders. */
  let filter = '';
  /** The selected subtab id, kept across re-renders like the filter. */
  const subtabs = callbacks.subtabs ?? [];
  let activeSubtab = subtabs[0]?.id ?? null;
  /** Whether an inline editor is open, in which case the list is hidden. */
  let editing = false;

  // The chrome hides while an inline editor is open rather than being torn
  // down, so the filter text and the selected subtab come back untouched. The
  // editor is tall, and a list scrolling behind it would bury the Save button.
  const chrome = el('div');
  const editorHost = el('div');
  root.append(chrome, editorHost);

  /** @param {LibrarySource} source */
  const badgeText = (source) =>
    source === 'override' ? 'customized' : source === 'custom' ? 'custom' : '';

  /** @param {string | null} key the entry being edited, or null for a new one */
  function openEditor(key) {
    const buildEditor = callbacks.buildEditor;
    if (!buildEditor) return;
    editing = true;
    chrome.hidden = true;
    editorHost.appendChild(buildEditor(key, update));
  }

  chrome.appendChild(
    el(
      'div',
      'panel-actions panel-actions--pinned',
      textButton(
        callbacks.addLabel,
        async () => {
          if (callbacks.buildEditor) openEditor(null);
          else if (callbacks.onAdd && (await callbacks.onAdd())) refresh();
        },
        { icon: 'add' },
      ),
    ),
  );

  /** @type {Map<string, { update: () => void }>} */
  const lists = new Map();

  if (subtabs.length > 0) {
    // The subtab strip narrows the list to one category. Each subtab owns its
    // own list, so switching tabs only flips which one is hidden.
    const panels = subtabs.map((subtab) => ({
      id: subtab.id,
      label: subtab.label,
      panel: el('div'),
    }));
    const tabs = buildTabs({
      className: 'library-panel__subtabs',
      ariaLabel: 'Entry categories',
      tabs: panels,
      onSelect: (id) => {
        activeSubtab = id;
        lists.get(id)?.update();
      },
    });
    chrome.appendChild(tabs.tablist);
    chrome.appendChild(buildFilter());
    for (const { id, panel } of panels) {
      chrome.appendChild(panel);
      lists.set(id, mountList(panel, id));
    }
  } else {
    chrome.appendChild(buildFilter());
    const panel = el('div');
    chrome.appendChild(panel);
    lists.set('', mountList(panel, null));
  }

  /** @returns {HTMLInputElement} */
  function buildFilter() {
    const filterInput = textField(filter, 'Filter by name...', {
      type: 'search',
      className: 'library-panel__filter',
      ariaLabel: 'Filter entries by name',
    });
    filterInput.addEventListener('input', () => {
      filter = filterInput.value;
      lists.get(activeSubtab ?? '')?.update();
    });
    return filterInput;
  }

  /**
   * One subtab's list of entries, filtered by name.
   * @param {HTMLElement} host
   * @param {string | null} subtabId
   * @returns {{ update: () => void }}
   */
  function mountList(host, subtabId) {
    return mountListPanel(host, {
      className: 'u-col u-g1',
      rowClass: 'library-panel__row',
      headClass: 'library-panel__head',
      getRows: () => {
        const query = filter.trim().toLowerCase();
        return callbacks
          .getEntries(subtabId ?? undefined)
          .filter((entry) => !query || entry.name.toLowerCase().includes(query));
      },
      emptyMessage: () => (filter.trim() ? 'No entries match.' : 'No entries.'),
      groupOf: /** @param {LibraryRow} entry */ (entry) => entry.group ?? null,
      groupHeadingClass: 'section-label library-panel__group',
      buildBody,
      actions: rowActions,
      buildExtras,
      // The rows are built fresh out of the library on every read, so the
      // identity guard would never match anyway, and the filter needs the
      // repaint on every keystroke.
      alwaysRender: true,
    });
  }

  /** @param {LibraryRow} entry @returns {Node[]} */
  function buildBody(entry) {
    const name = el('span', 'library-panel__name', entry.name);
    const badge = badgeText(entry.source);
    if (!badge) return [name];
    return [
      name,
      el('span', `badge library-panel__badge library-panel__badge--${entry.source}`, badge),
    ];
  }

  /**
   * @param {LibraryRow} entry
   * @returns {(import('./listPanel.js').RowAction<LibraryRow> | null)[]}
   */
  function rowActions(entry) {
    return [
      callbacks.onSpawn
        ? {
            icon: 'give',
            label: `${callbacks.spawnLabel ?? 'Add to campaign'}: ${entry.name}`,
            title: callbacks.spawnLabel ?? 'Add to campaign',
            onClick: () => callbacks.onSpawn?.(entry.key),
          }
        : null,
      {
        icon: 'edit',
        label: `Edit ${entry.name}`,
        // Editing a default doesn't touch the built-in list — it stores an
        // override in the custom library; say so on the control.
        title: entry.source === 'default' ? 'Customize' : 'Edit',
        onClick: () => {
          if (callbacks.buildEditor) {
            openEditor(entry.key);
            // The list is hidden behind the editor now; redrawing it is waste.
            return false;
          }
          return callbacks.onEdit?.(entry.key);
        },
      },
      entry.source === 'default'
        ? null
        : {
            icon: 'remove',
            label:
              entry.source === 'override'
                ? `Revert ${entry.name} to default`
                : `Delete ${entry.name}`,
            variant: 'danger',
            title: entry.source === 'override' ? 'Revert to default' : 'Delete',
            onClick: () => callbacks.onRemove(entry.key, entry.source),
          },
    ];
  }

  /** @param {LibraryRow} entry @param {HTMLElement} row */
  function buildExtras(entry, row) {
    if (!entry.summary) return;
    row.appendChild(el('div', 'u-muted', entry.summary));
  }

  /** Redraw every list, whether or not its tab is the visible one. */
  function refresh() {
    for (const list of lists.values()) list.update();
  }

  /** Close any open editor and redraw, which is also the editor's own exit. */
  function update() {
    if (editing) {
      editing = false;
      editorHost.innerHTML = '';
      chrome.hidden = false;
    }
    refresh();
  }

  return { update };
}
