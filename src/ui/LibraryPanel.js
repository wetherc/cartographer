import { badge, textButton } from './buttons.js';
import { el } from './dom.js';
import { labeled, select, setOptions, textField } from './formFields.js';
import { facetOptions, matchesFacets } from '../library/LibraryFacets.js';
import { mountListPanel } from './listPanel.js';
import { openDialog } from './Modal.js';
import { buildTabs } from './Tabs.js';

/** @typedef {import('../types/library.js').LibrarySource} LibrarySource */

/**
 * @typedef {{
 *   key: string,
 *   name: string,
 *   summary: string,
 *   source: LibrarySource,
 *   group?: string,
 *   tags?: string[],
 * }} LibraryRow
 */

/**
 * Mount one Library-rail list, for equipment, creatures, or spells.
 * It shows every built-in default plus the GM's overrides and additions,
 * with each row tagged by source. Editing goes through either
 * `buildEditor`, a form that this panel shows in a dialog over the list,
 * or `onEdit`, which opens a dialog of its own. The list stays in place
 * under the dialog, so its scroll offset and the filter do not change.
 * Overrides and customs get a remove button that reverts or deletes.
 *
 * This panel owns no library state. `getEntries` supplies the rows, and
 * every mutation flows back through a callback, matching the other
 * panels. When `subtabs` are given, a tab strip above the filter narrows
 * the list to one subtab at a time, and `getEntries` receives the active
 * subtab's id.
 *
 * The add button, the tab strip, and the filter input are built once and
 * stay in place. Only the lists redraw. This lets a keystroke in the
 * filter rerun the search without rebuilding the input the GM is typing into.
 * @param {HTMLElement} container
 * @param {{
 *   getEntries: (subtab?: string) => LibraryRow[],
 *   subtabs?: { id: string, label: string }[],
 *   addLabel: string,
 *   onAdd?: () => Promise<unknown>,
 *   onEdit?: (key: string) => Promise<unknown>,
 *   buildEditor?: (key: string | null, close: () => void, subtab?: string) => HTMLElement,
 *   onRemove: (key: string, source: LibrarySource) => Promise<unknown>,
 *   onSpawn?: (key: string) => void,
 *   spawnLabel?: string,
 *   facets?: { id: string, label: string, all: string }[],
 * }} callbacks
 * @returns {{ update: () => void }}
 */
export function mountLibraryPanel(container, callbacks) {
  const root = el('div', 'library-panel');
  container.appendChild(root);

  /** This is a case-insensitive name filter, kept across rerenders. */
  let filter = '';
  /** This is the selected subtab id, kept across rerenders like the filter. */
  const subtabs = callbacks.subtabs ?? [];
  let activeSubtab = subtabs[0]?.id ?? null;

  /** The facet selects, such as class and level for spells, with their
   * chosen tag. They sit beside the name filter and stay across rerenders. */
  const facets = (callbacks.facets ?? []).map((facet) => ({
    ...facet,
    picker: select([{ value: '', label: facet.all }], ''),
    wrap: /** @type {HTMLElement | null} */ (null),
  }));
  const chosen = () => facets.map((f) => f.picker.value);

  const chrome = el('div');
  root.appendChild(chrome);

  /** @param {LibrarySource} source */
  const badgeText = (source) =>
    source === 'override' ? 'customized' : source === 'custom' ? 'custom' : '';

  /**
   * Show the editor form in a dialog. The form's own Cancel and Save buttons
   * close the dialog through `close`, and Escape closes it as a cancel. The
   * lists redraw when the dialog closes, and the dialog returns focus to the
   * row button that opened it.
   * @param {string | null} key the entry being edited, or null for a new one
   * @param {string} title
   */
  function openEditor(key, title) {
    const buildEditor = callbacks.buildEditor;
    if (!buildEditor) return;
    void openDialog({
      className: 'modal--library-editor',
      title,
      build: (close) => {
        // The active subtab goes along, so a panel whose subtabs list
        // different entry kinds can pick the right form for a new entry.
        const editor = buildEditor(key, () => close(), activeSubtab ?? undefined);
        const first = /** @type {HTMLElement | null} */ (
          editor.querySelector('input, select, textarea')
        );
        return { body: [editor], initialFocus: first };
      },
    }).then(refresh);
  }

  chrome.appendChild(
    el(
      'div',
      'panel-actions panel-actions--pinned',
      textButton(
        callbacks.addLabel,
        async () => {
          if (callbacks.buildEditor) openEditor(null, callbacks.addLabel);
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
        syncFacets();
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

  /** Offer each facet the values that the rows of the shown subtab carry.
   * A facet with no values hides, and a choice that is gone resets to all. */
  function syncFacets() {
    const rows = callbacks.getEntries(activeSubtab ?? undefined);
    for (const facet of facets) {
      const { id, all, picker } = facet;
      const options = facetOptions(rows, id, all);
      const kept = options.some((o) => o.value === picker.value) ? picker.value : '';
      setOptions(picker, options, kept);
      if (facet.wrap) facet.wrap.hidden = options.length < 2;
    }
  }

  /** @returns {HTMLElement} */
  function buildFilter() {
    const filterInput = textField(filter, {
      placeholder: 'Filter by name...',
      type: 'search',
      className: 'library-panel__filter',
      ariaLabel: 'Filter entries by name',
    });
    filterInput.addEventListener('input', () => {
      filter = filterInput.value;
      lists.get(activeSubtab ?? '')?.update();
    });
    if (facets.length === 0) return filterInput;
    const row = el('div', 'library-panel__filters', filterInput);
    for (const facet of facets) {
      facet.picker.addEventListener('change', () => lists.get(activeSubtab ?? '')?.update());
      facet.wrap = labeled(facet.label, facet.picker);
      row.appendChild(facet.wrap);
    }
    queueMicrotask(syncFacets);
    return row;
  }

  /**
   * One subtab's list of entries, filtered by name.
   * @param {HTMLElement} host
   * @param {string | null} subtabId
   * @returns {{ update: () => void }}
   */
  function mountList(host, subtabId) {
    return mountListPanel(host, {
      className: 'library-panel__list u-col u-g1',
      classes: {
        row: 'library-panel__row',
        head: 'library-panel__head',
        groupHeading: 'library-panel__group',
      },
      getRows: () => {
        const query = filter.trim().toLowerCase();
        return callbacks
          .getEntries(subtabId ?? undefined)
          .filter((entry) => !query || entry.name.toLowerCase().includes(query))
          .filter((entry) => matchesFacets(entry.tags, chosen()));
      },
      emptyMessage: () =>
        filter.trim() || chosen().some(Boolean) ? 'No entries match.' : 'No entries.',
      groupOf: /** @param {LibraryRow} entry */ (entry) => entry.group ?? null,
      buildBody,
      actions: rowActions,
      buildExtras,
      // `getEntries` builds a fresh row object per entry, so the identity
      // guard already misses on every read and the filter gets its repaint
      // per keystroke. The one thing outside the rows is the empty
      // message, which differs between a filtered and an unfiltered list.
      // Only that boolean is in the guard. If the message ever names the
      // filter text, put the text itself here: two filters that both match
      // nothing produce equal empty row lists, and the boolean would then
      // leave a stale name on screen.
      dependsOn: () => filter.trim() !== '' || chosen().some(Boolean),
    });
  }

  /** @param {LibraryRow} entry @returns {Node[]} */
  function buildBody(entry) {
    const name = el('span', 'library-panel__name', entry.name);
    const text = badgeText(entry.source);
    if (!text) return [name];
    return [
      name,
      badge(text, { className: `library-panel__badge library-panel__badge--${entry.source}` }),
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
        // Editing a default does not touch the built-in list. It stores
        // an override in the custom library. The control states this.
        title: entry.source === 'default' ? 'Customize' : 'Edit',
        onClick: () => {
          if (callbacks.buildEditor) {
            const verb = entry.source === 'default' ? 'Customize' : 'Edit';
            openEditor(entry.key, `${verb} ${entry.name}`);
            // The dialog redraws the lists when it closes.
            return false;
          }
          return callbacks.onEdit?.(entry.key);
        },
      },
      entry.source === 'default'
        ? null
        : entry.source === 'override'
          ? // A revert keeps the entry and gets a neutral arrow, so it does
            // not read as the red trash of a delete.
            {
              icon: 'revert',
              label: `Revert ${entry.name} to default`,
              title: 'Revert to default',
              onClick: () => callbacks.onRemove(entry.key, entry.source),
            }
          : {
              icon: 'remove',
              label: `Delete ${entry.name}`,
              variant: 'danger',
              title: 'Delete',
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
    syncFacets();
    for (const list of lists.values()) list.update();
  }

  return { update: refresh };
}
