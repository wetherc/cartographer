import { mustGetElement } from '../ui/dom.js';
import { confirmModal } from '../ui/Modal.js';
import { wireTabs } from '../ui/Tabs.js';
import {
  emptyLibrary,
  isLibraryEmpty,
  setActiveLibrary,
  nameKey,
  upsertEntry,
  removeEntry,
  storedEntryId,
  renameConflict,
} from '../library/Library.js';
import {
  loadCustomLibrary,
  saveCustomLibrary,
  clearCustomLibrary,
  fetchLibraryFile,
  downloadLibrary,
  readLibraryFromFile,
  libraryCounts,
  LIBRARY_FILE,
} from '../storage/LibraryStore.js';
import { mountEntryPanels } from './libraryPanels.js';
import { mountTablePanel } from './libraryTables.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/library.js').CustomLibrary} CustomLibrary */

/**
 * Build the rail for the Library mode. It shows the merged built-in and
 * custom lists for equipment, creatures, spells, feats, and random tables, plus
 * export, import, and reset controls for the custom library.
 * The custom library is not campaign state, by design. It persists in its
 * own key in localStorage, survives New, Import, and Load Example, and it
 * round-trips through a portable JSON file that the GM keeps at
 * library/campaign-library.json. An empty browser loads that file
 * automatically at startup.
 * @param {AppContext} app
 */
export function wireLibrary(app) {
  // loadCustomLibrary parses and normalizes the stored JSON, so this call
  // happens only once. A second call at startup repeats that work.
  // A null result means nothing is stored, and the file seed below handles that case.
  const stored = loadCustomLibrary();
  /** The current custom library. The active registry in Library.js mirrors this value. */
  let custom = stored ?? emptyLibrary();
  const hadStored = stored !== null;

  /**
   * Refresh all five lists after a library change, and refresh the character
   * panels too. The spellbook shows the catalog spells, so an edited or
   * removed entry must reach it as well.
   * Every caller is a user action or the promise callback for the file seed.
   * Both run after all wiring completes, so the party action is registered.
   * The lists update only once they are mounted. A list that mounts later
   * reads the current library when it paints.
   */
  // Reset stays disabled while the library has no customizations, because
  // it would remove nothing.
  const resetButton = /** @type {HTMLButtonElement} */ (mustGetElement('library-reset-btn'));
  const refresh = () => {
    resetButton.disabled = isLibraryEmpty(custom);
    for (const panel of panels ?? []) panel.update();
    app.actions.refreshSelectedCharacter();
    app.actions.refreshDiceTables();
  };

  /** Apply a new custom library, store it, and refresh the display. @param {CustomLibrary} next */
  const setCustom = (next) => {
    custom = next;
    setActiveLibrary(next);
    if (!saveCustomLibrary(next)) {
      app.toasts.show(
        'The library change could not be stored: browser storage is full. Export the library to keep it.',
        { level: 'error' },
      );
    }
    refresh();
  };

  /**
   * Apply one edit onto the latest stored library, then store and show the
   * result. Two tabs can edit the library at once. Each edit starts from what
   * storage holds now, not from this tab's copy, so a write from one tab does
   * not erase an edit the other tab stored in between. When nothing is stored
   * (a reset in another tab, or a fresh browser), the edit applies onto an
   * empty library.
   * @param {(base: CustomLibrary) => CustomLibrary} edit
   */
  const updateCustom = (edit) => setCustom(edit(loadCustomLibrary() ?? emptyLibrary()));

  /**
   * The shared onRemove handler for every library list. Removing an override
   * reverts the entry to its built-in default. Removing a custom entry
   * deletes it.
   * This function is the single place for that wording and for the danger
   * style that applies only to delete. The noun parameter names the entry
   * kind in the confirm dialog. The apply parameter removes the confirmed
   * key from the custom library.
   * @param {string} noun
   * @param {(key: string) => void} apply
   * @returns {(key: string, source: string) => Promise<boolean>}
   */
  const makeRemoveHandler = (noun, apply) => async (key, source) => {
    const ok = await confirmModal(
      source === 'override'
        ? `Revert this ${noun} to the built-in default?`
        : `Delete this custom ${noun}?`,
      {
        title: source === 'override' ? `Revert this ${noun}?` : `Delete this ${noun}?`,
        variant: source === 'custom' ? 'danger' : 'primary',
        confirmLabel: source === 'override' ? 'Revert' : 'Delete',
      },
    );
    if (ok) apply(key);
    return ok;
  };

  /**
   * Store an edited name-keyed entry (a creature template or a spell) under
   * its key, which can change on rename.
   * A rename removes the old custom entry instead of leaving both entries in
   * place. An edit to a built-in entry stores a custom override.
   * The id comes from storedEntryId. This function keeps a custom entry's id
   * stable across a rename, so campaign references to the id remain valid.
   * The form owns the fields. This function owns the identity and the merge
   * key.
   * A new id must avoid every id in the list namespace, both the built-in
   * defaults and the stored custom entries, not only the ids visible in the
   * merged list. An overridden default hides its own id, but that id returns
   * when the override is renamed or removed. A new id that reuses it makes
   * one of the two entries unreachable through the last-wins id index.
   * A rename onto a name that another entry already holds is refused with a
   * toast, and the form stays open. The store would otherwise replace that
   * entry by name and drop its id from the index, so every spellbook holding
   * the id would lose the spell with no message.
   * @param {'creatures' | 'spells' | 'feats'} list which custom-library list to write
   * @param {string} noun the entry kind, for the refusal toast
   * @param {() => { entry: { id: string, name: string }, source: import('../types/library.js').LibrarySource }[]} activeEntries
   * @param {{ id: string }[]} defaults the list's built-in entries
   * @returns {(key: string | null, fields: { name: string }) => boolean} true when stored
   */
  const makeKeyedStore = (list, noun, activeEntries, defaults) => (key, fields) => {
    const newKey = nameKey(fields);
    const renamed = key !== newKey;
    const merged = activeEntries();
    const found = key ? merged.find(({ entry }) => nameKey(entry) === key) : null;
    const target = merged.find(({ entry }) => nameKey(entry) === newKey);
    if (renameConflict({ found, target, renamed })) {
      app.toasts.show(
        `Another ${noun} is already named "${fields.name.trim()}". Choose a different name.`,
        { level: 'error' },
      );
      return false;
    }
    updateCustom((base) => {
      const held = /** @type {{ id: string, name: string }[]} */ (base[list]);
      const takenIds = () => [...defaults, ...held].map((entry) => entry.id);
      const id = storedEntryId({ found, target, renamed, newKey, takenIds });
      const entry = /** @type {any} */ ({ ...fields, id });
      const next = key && renamed ? removeEntry(held, key, nameKey) : held;
      return { ...base, [list]: upsertEntry(next, entry, nameKey) };
    });
    return true;
  };

  setActiveLibrary(custom);

  // Seed an empty browser from the library file. A fresh clone or a cleared
  // browser then picks up the GM customizations without a manual import.
  // A browser that already holds a library keeps it. The file loads only
  // when the GM selects Import. The fetch is asynchronous, so the GM, or
  // another tab, can store an edit before it resolves. That edit wins: the
  // seed is skipped once anything is stored or held in this tab.
  if (!hadStored) {
    fetchLibraryFile().then((library) => {
      if (!library || isLibraryEmpty(library)) return;
      if (!isLibraryEmpty(custom) || loadCustomLibrary() !== null) return;
      setCustom(library);
      app.toasts.show(`Loaded the custom library from ${LIBRARY_FILE}.`);
    });
  }

  wireTabs(mustGetElement('library-tabs'));

  /**
   * Mount the five lists. They hold about a quarter of the page's elements,
   * and only Library mode shows them, so they mount on the first switch to
   * Library mode rather than at startup. A Player tab cannot enter Library
   * mode, so it never builds them.
   */
  const mountPanels = () => [
    ...mountEntryPanels(app, { updateCustom, makeRemoveHandler, makeKeyedStore }),
    mountTablePanel(app, { updateCustom, makeRemoveHandler }),
  ];
  /** The mounted lists, or null before the first visit to Library mode. */
  let panels = /** @type {{ update: () => void }[] | null} */ (null);
  app.actions.showLibrary = () => {
    panels ??= mountPanels();
  };

  // --- Library file controls -------------------------------------------------

  mustGetElement('library-export-btn').addEventListener('click', () => {
    downloadLibrary(custom);
    app.toasts.show('Library exported. Use Import library to load it in another browser.');
  });

  const importInput = /** @type {HTMLInputElement} */ (mustGetElement('library-import-input'));
  mustGetElement('library-import-btn').addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', async () => {
    const file = importInput.files?.[0];
    importInput.value = '';
    if (!file) return;
    /** @type {CustomLibrary | null} */
    let imported;
    try {
      imported = await readLibraryFromFile(file);
    } catch {
      app.toasts.show('That file is not a readable library JSON.', { level: 'error' });
      return;
    }
    if (!imported) {
      app.toasts.show('That file is not a library file.', { level: 'error' });
      return;
    }
    if (!isLibraryEmpty(custom)) {
      const ok = await confirmModal(
        `Your library has ${libraryCounts(custom)}. This file has ${libraryCounts(imported)}. Replace your customizations with this file? Built-in defaults are unaffected.`,
        { title: 'Replace your library?', variant: 'danger', confirmLabel: 'Replace' },
      );
      if (!ok) return;
    }
    setCustom(imported);
    app.toasts.show(`Library loaded: ${libraryCounts(imported)}.`);
  });

  resetButton.disabled = isLibraryEmpty(custom);
  resetButton.addEventListener('click', async () => {
    const ok = await confirmModal(
      'Remove all library customizations? Built-in defaults are unaffected. Export first to keep a copy.',
      { title: 'Reset your library?', variant: 'danger', confirmLabel: 'Reset' },
    );
    if (!ok) return;
    custom = emptyLibrary();
    setActiveLibrary(custom);
    // Clear the stored key instead of storing an empty library, so the next
    // page load can seed from the library file again.
    clearCustomLibrary();
    refresh();
    app.toasts.show('Library customizations removed.');
  });
}
