import { icon } from './icons.js';

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
  const root = document.createElement('div');
  root.className = 'library-panel';
  container.appendChild(root);

  /** Case-insensitive name filter, kept across re-renders. */
  let filter = '';
  /** The selected subtab id, kept across re-renders like the filter. */
  let activeSubtab = callbacks.subtabs?.[0]?.id ?? null;
  /** The row being edited inline ('new' for the add form), or null. */
  /** @type {string | null} */
  let editing = null;

  /** @param {LibrarySource} source */
  const badgeText = (source) =>
    source === 'override' ? 'customized' : source === 'custom' ? 'custom' : '';

  function render() {
    root.innerHTML = '';

    // Inline editing replaces the whole list so the rail reads as one thing
    // at a time — the item form is tall, and a list scrolling behind it would
    // bury the Save button.
    if (editing !== null && callbacks.buildEditor) {
      root.appendChild(
        callbacks.buildEditor(editing === 'new' ? null : editing, () => {
          editing = null;
          render();
        }),
      );
      return;
    }

    const actions = document.createElement('div');
    actions.className = 'panel-actions panel-actions--pinned';
    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.className = 'btn';
    addButton.append(icon('add'), document.createTextNode(callbacks.addLabel));
    addButton.addEventListener('click', async () => {
      if (callbacks.buildEditor) {
        editing = 'new';
        render();
      } else if (callbacks.onAdd) {
        if (await callbacks.onAdd()) render();
      }
    });
    actions.appendChild(addButton);
    root.appendChild(actions);

    // The subtab strip narrows the list to one category; like the inventory
    // panel's tabs it survives the full re-render each mutation triggers.
    const subtabs = callbacks.subtabs;
    if (subtabs && subtabs.length > 0) {
      const tablist = document.createElement('div');
      tablist.className = 'tabs library-panel__subtabs';
      tablist.setAttribute('role', 'tablist');
      tablist.setAttribute('aria-label', 'Entry categories');
      for (const subtab of subtabs) {
        const tab = document.createElement('button');
        tab.type = 'button';
        tab.className = 'tabs__tab';
        tab.setAttribute('role', 'tab');
        tab.textContent = subtab.label;
        const selected = activeSubtab === subtab.id;
        tab.setAttribute('aria-selected', String(selected));
        tab.tabIndex = selected ? 0 : -1;
        tab.addEventListener('click', () => {
          activeSubtab = subtab.id;
          render();
        });
        tablist.appendChild(tab);
      }
      tablist.addEventListener('keydown', (event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        const index = subtabs.findIndex((s) => s.id === activeSubtab);
        const step = event.key === 'ArrowRight' ? 1 : -1;
        activeSubtab = subtabs[(index + step + subtabs.length) % subtabs.length].id;
        render();
        const nextTab = /** @type {HTMLElement | null} */ (
          root.querySelector('[role=tab][aria-selected=true]')
        );
        nextTab?.focus();
      });
      root.appendChild(tablist);
    }

    const filterInput = document.createElement('input');
    filterInput.type = 'search';
    filterInput.placeholder = 'Filter by name...';
    filterInput.className = 'field library-panel__filter';
    filterInput.setAttribute('aria-label', 'Filter entries by name');
    filterInput.value = filter;
    filterInput.addEventListener('input', () => {
      filter = filterInput.value;
      renderList();
    });
    root.appendChild(filterInput);

    const list = document.createElement('div');
    list.className = 'library-panel__list';
    root.appendChild(list);

    function renderList() {
      list.innerHTML = '';
      const query = filter.trim().toLowerCase();
      const entries = callbacks
        .getEntries(activeSubtab ?? undefined)
        .filter((e) => !query || e.name.toLowerCase().includes(query));

      if (entries.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'empty-state';
        empty.textContent = query ? 'No entries match.' : 'No entries.';
        list.appendChild(empty);
        return;
      }

      let lastGroup = null;
      for (const entry of entries) {
        if (entry.group && entry.group !== lastGroup) {
          const heading = document.createElement('h3');
          heading.className = 'library-panel__group';
          heading.textContent = entry.group;
          list.appendChild(heading);
          lastGroup = entry.group;
        }
        list.appendChild(buildRow(entry));
      }
    }

    /** @param {LibraryRow} entry */
    function buildRow(entry) {
      const row = document.createElement('div');
      row.className = 'library-panel__row';

      const head = document.createElement('div');
      head.className = 'library-panel__head';

      const name = document.createElement('span');
      name.className = 'library-panel__name';
      name.textContent = entry.name;
      head.appendChild(name);

      const badge = badgeText(entry.source);
      if (badge) {
        const chip = document.createElement('span');
        chip.className = `library-panel__badge library-panel__badge--${entry.source}`;
        chip.textContent = badge;
        head.appendChild(chip);
      }

      if (callbacks.onSpawn) {
        const spawnButton = document.createElement('button');
        spawnButton.type = 'button';
        spawnButton.className = 'btn btn--icon';
        const spawnLabel = `${callbacks.spawnLabel ?? 'Add to campaign'}: ${entry.name}`;
        spawnButton.setAttribute('aria-label', spawnLabel);
        spawnButton.title = callbacks.spawnLabel ?? 'Add to campaign';
        spawnButton.appendChild(icon('give'));
        spawnButton.addEventListener('click', () => callbacks.onSpawn?.(entry.key));
        head.appendChild(spawnButton);
      }

      const editButton = document.createElement('button');
      editButton.type = 'button';
      editButton.className = 'btn btn--icon';
      editButton.setAttribute('aria-label', `Edit ${entry.name}`);
      // Editing a default doesn't touch the built-in list — it stores an
      // override in the custom library; say so on the control.
      editButton.title = entry.source === 'default' ? 'Customize' : 'Edit';
      editButton.appendChild(icon('edit'));
      editButton.addEventListener('click', async () => {
        if (callbacks.buildEditor) {
          editing = entry.key;
          render();
        } else if (callbacks.onEdit) {
          if (await callbacks.onEdit(entry.key)) render();
        }
      });
      head.appendChild(editButton);

      if (entry.source !== 'default') {
        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'btn btn--icon';
        const removeLabel =
          entry.source === 'override' ? `Revert ${entry.name} to default` : `Delete ${entry.name}`;
        removeButton.setAttribute('aria-label', removeLabel);
        removeButton.title = entry.source === 'override' ? 'Revert to default' : 'Delete';
        removeButton.appendChild(icon('remove'));
        removeButton.addEventListener('click', async () => {
          if (await callbacks.onRemove(entry.key, entry.source)) render();
        });
        head.appendChild(removeButton);
      }

      row.appendChild(head);

      if (entry.summary) {
        const summary = document.createElement('div');
        summary.className = 'library-panel__summary';
        summary.textContent = entry.summary;
        row.appendChild(summary);
      }
      return row;
    }

    renderList();
  }

  render();
  return {
    update: () => {
      editing = null;
      render();
    },
  };
}
