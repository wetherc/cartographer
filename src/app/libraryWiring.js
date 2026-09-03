import { mustGetElement } from '../ui/dom.js';
import { confirmModal } from '../ui/Modal.js';
import { wireTabs } from '../ui/Tabs.js';
import { mountLibraryPanel } from '../ui/LibraryPanel.js';
import { buildItemForm } from '../ui/ItemForm.js';
import { buildSpellForm } from '../ui/SpellForm.js';
import { buildCreatureTemplateForm } from '../ui/CreatureTemplateForm.js';
import { buildFeatForm } from '../ui/FeatForm.js';
import {
  emptyLibrary,
  isLibraryEmpty,
  setActiveLibrary,
  equipmentKey,
  nameKey,
  activeEquipmentEntries,
  activeCreatureEntries,
  activeSpellEntries,
  activeFeatEntries,
  upsertEntry,
  removeEntry,
  storedEntryId,
  renameConflict,
  DEFAULT_CREATURES,
  DEFAULT_FEATS,
} from '../library/Library.js';
import {
  loadCustomLibrary,
  saveCustomLibrary,
  clearCustomLibrary,
  fetchLibraryFile,
  downloadLibrary,
  readLibraryFromFile,
  LIBRARY_FILE,
} from '../storage/LibraryStore.js';
import { DEFAULT_SPELLS } from '../data/spells.js';
import { itemSummary } from '../entities/Equipment.js';
import { creatureForm } from './creatureForm.js';
import { creatureSummary, featSummary, spellSummary } from './librarySummaries.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/library.js').CustomLibrary} CustomLibrary */
/** @typedef {import('../types/library.js').EquipmentTemplate} EquipmentTemplate */
/** @typedef {import('../types/creature.js').CreatureTemplate} CreatureTemplate */
/** @typedef {import('../types/spell.js').Spell} Spell */
/** @typedef {import('../types/feat.js').Feat} Feat */

/** The section headings for the equipment list, in display order. */
const TYPE_GROUPS = /** @type {Record<string, string>} */ ({
  weapon: 'Weapons',
  bow: 'Bows',
  armor: 'Armor',
  helmet: 'Helmets',
  gloves: 'Gloves',
  greaves: 'Greaves',
  shield: 'Shields',
  ring: 'Rings',
  consumable: 'Consumables',
  gear: 'Gear',
});

/** The subtabs for the equipment list. Each subtab shows one category of item types. */
const EQUIPMENT_SUBTABS = [
  { id: 'weapons', label: 'Weapons', types: ['weapon', 'bow'] },
  { id: 'armor', label: 'Armor', types: ['armor', 'helmet', 'gloves', 'greaves', 'shield'] },
  { id: 'rings', label: 'Rings', types: ['ring'] },
  { id: 'consumables', label: 'Consumables', types: ['consumable'] },
  { id: 'gear', label: 'Gear', types: ['gear'] },
];

/** The subtabs for the creature list. Foes are the hostile templates, and
 * People are the rest. An edit that changes the disposition moves the entry
 * to the other subtab. */
const CREATURE_SUBTABS = [
  { id: 'foes', label: 'Foes' },
  { id: 'people', label: 'People' },
];

/**
 * Build the rail for the Library mode. It shows the merged built-in and
 * custom lists for equipment, creatures, spells, and feats, plus
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
   * Refresh all four lists after a library change, and refresh the character
   * panels too. The spellbook shows the catalog spells, so an edited or
   * removed entry must reach it as well.
   * Every caller is a user action or the promise callback for the file seed.
   * Both run after all wiring completes, so the party action is registered
   * and the four panel constants below are already assigned.
   * Do not call this function during wiring. The panels are mounted after
   * this function is defined, so an early call throws an error instead of
   * skipping a refresh.
   */
  const refresh = () => {
    equipmentPanel.update();
    creaturePanel.update();
    spellPanel.update();
    featPanel.update();
    app.actions.refreshSelectedCharacter();
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

  // --- Equipment -----------------------------------------------------------

  const equipmentPanel = mountLibraryPanel(mustGetElement('library-equipment-container'), {
    addLabel: 'New item',
    subtabs: EQUIPMENT_SUBTABS,
    getEntries: (subtab) => {
      const merged = activeEquipmentEntries();
      const category = EQUIPMENT_SUBTABS.find((s) => s.id === subtab) ?? EQUIPMENT_SUBTABS[0];
      // Order entries by type within the subtab so the group headings stay
      // contiguous. The merged order (defaults first, then custom entries)
      // stays intact within each type. A heading that would repeat the tab
      // label is skipped: a single-type subtab has no headings at all, and
      // a multi-type subtab leaves its namesake type unheaded, so only the
      // other types announce themselves.
      return category.types.flatMap((type) => {
        const group = TYPE_GROUPS[type] ?? type;
        return merged
          .filter(({ entry }) => entry.type === type)
          .map(({ entry, source }) => ({
            key: equipmentKey(entry),
            name: entry.name,
            summary:
              itemSummary(/** @type {import('../types/entities.js').InventoryItem} */ (entry)) ||
              entry.description ||
              '',
            source,
            group: category.types.length > 1 && group !== category.label ? group : undefined,
          }));
      });
    },
    // The full item form appears inline in the rail. Editing a built-in
    // default stores the result as an override. A new name creates a new
    // custom entry.
    buildEditor: (key, close) => {
      const found = key
        ? activeEquipmentEntries().find(({ entry }) => equipmentKey(entry) === key)
        : null;
      return buildItemForm({
        item: found
          ? /** @type {import('../types/entities.js').InventoryItem} */ ({
              id: 'library',
              quantity: 1,
              notes: '',
              ...found.entry,
            })
          : null,
        template: true,
        submitLabel: found ? 'Save' : 'Add',
        onCancel: close,
        onSubmit: (fields) => {
          const { quantity: _quantity, notes: _notes, ...rest } = fields;
          const entry = /** @type {EquipmentTemplate} */ (rest);
          // A rename or a type change removes the old custom entry instead
          // of leaving both. Renaming a default only adds the renamed copy.
          updateCustom((base) => {
            const moved = key && key !== equipmentKey(entry);
            const next = moved ? removeEntry(base.equipment, key, equipmentKey) : base.equipment;
            return { ...base, equipment: upsertEntry(next, entry, equipmentKey) };
          });
          close();
        },
      });
    },
    onRemove: makeRemoveHandler('entry', (key) =>
      updateCustom((base) => ({
        ...base,
        equipment: removeEntry(base.equipment, key, equipmentKey),
      })),
    ),
  });

  // --- Creatures -------------------------------------------------------------

  const storeCreature = makeKeyedStore(
    'creatures',
    'creature',
    activeCreatureEntries,
    DEFAULT_CREATURES,
  );

  const creaturePanel = mountLibraryPanel(mustGetElement('library-creatures-container'), {
    addLabel: 'New creature',
    subtabs: CREATURE_SUBTABS,
    getEntries: (subtab) =>
      activeCreatureEntries()
        .filter(({ entry }) => (entry.disposition === 'hostile') === (subtab === 'foes'))
        .map(({ entry, source }) => ({
          key: nameKey(entry),
          name: entry.name,
          summary: creatureSummary(entry),
          source,
        })),
    // The full creature form appears inline in the rail. The subtab picks
    // the field spec for a new entry, and an existing entry's disposition
    // picks it on edit. Editing a built-in default stores the result as an
    // override. A new name creates a new custom entry.
    buildEditor: (key, close, subtab) => {
      const found = key
        ? activeCreatureEntries().find(({ entry }) => nameKey(entry) === key)
        : null;
      return buildCreatureTemplateForm({
        template: found?.entry ?? null,
        hostile: found ? found.entry.disposition === 'hostile' : subtab === 'foes',
        submitLabel: found ? 'Save' : 'Add',
        onCancel: close,
        onSubmit: (fields) => {
          if (storeCreature(key, fields)) close();
        },
      });
    },
    onRemove: makeRemoveHandler('creature', (key) =>
      updateCustom((base) => ({ ...base, creatures: removeEntry(base.creatures, key, nameKey) })),
    ),
    // Spawn a campaign creature from a template. The matching campaign
    // dialog opens pre-filled from the template, with placement set to the
    // party position by default.
    spawnLabel: 'Add to campaign',
    onSpawn: (key) => {
      const found = activeCreatureEntries().find(({ entry }) => nameKey(entry) === key);
      if (!found) return;
      const position = { ...app.partyTracker.getPosition() };
      creatureForm(app, null, position, found.entry);
    },
  });

  // --- Spells ----------------------------------------------------------------

  const storeSpell = makeKeyedStore('spells', 'spell', activeSpellEntries, DEFAULT_SPELLS);

  const spellPanel = mountLibraryPanel(mustGetElement('library-spells-container'), {
    addLabel: 'New spell',
    getEntries: () =>
      activeSpellEntries()
        .slice()
        .sort((a, b) => a.entry.level - b.entry.level || a.entry.name.localeCompare(b.entry.name))
        .map(({ entry, source }) => ({
          key: nameKey(entry),
          name: entry.name,
          summary: spellSummary(entry),
          source,
          group: entry.level === 0 ? 'Cantrips' : `Level ${entry.level}`,
        })),
    buildEditor: (key, close) => {
      const found = key ? activeSpellEntries().find(({ entry }) => nameKey(entry) === key) : null;
      return buildSpellForm({
        spell: found?.entry ?? null,
        submitLabel: found ? 'Save' : 'Add',
        onCancel: close,
        onSubmit: (fields) => {
          if (storeSpell(key, fields)) close();
        },
      });
    },
    onRemove: makeRemoveHandler('spell', (key) =>
      updateCustom((base) => ({ ...base, spells: removeEntry(base.spells, key, nameKey) })),
    ),
  });

  // --- Feats -----------------------------------------------------------------

  const storeFeat = makeKeyedStore('feats', 'feat', activeFeatEntries, DEFAULT_FEATS);

  const featPanel = mountLibraryPanel(mustGetElement('library-feats-container'), {
    addLabel: 'New feat',
    getEntries: () =>
      activeFeatEntries()
        .slice()
        .sort((a, b) => a.entry.name.localeCompare(b.entry.name))
        .map(({ entry, source }) => ({
          key: nameKey(entry),
          name: entry.name,
          summary: featSummary(entry),
          source,
        })),
    buildEditor: (key, close) => {
      const found = key ? activeFeatEntries().find(({ entry }) => nameKey(entry) === key) : null;
      return buildFeatForm({
        feat: found?.entry ?? null,
        submitLabel: found ? 'Save' : 'Add',
        onCancel: close,
        onSubmit: (fields) => {
          if (storeFeat(key, fields)) close();
        },
      });
    },
    onRemove: makeRemoveHandler('feat', (key) =>
      updateCustom((base) => ({ ...base, feats: removeEntry(base.feats, key, nameKey) })),
    ),
  });

  // --- Library file controls -------------------------------------------------

  mustGetElement('library-export-btn').addEventListener('click', () => {
    downloadLibrary(custom);
    app.toasts.show(`Library exported. Keep it as ${LIBRARY_FILE} to auto-load it.`);
  });

  const importInput = /** @type {HTMLInputElement} */ (mustGetElement('library-import-input'));
  mustGetElement('library-import-btn').addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', async () => {
    const file = importInput.files?.[0];
    importInput.value = '';
    if (!file) return;
    /** @type {CustomLibrary} */
    let imported;
    try {
      imported = await readLibraryFromFile(file);
    } catch {
      app.toasts.show('That file is not a readable library JSON.', { level: 'error' });
      return;
    }
    if (!isLibraryEmpty(custom)) {
      const ok = await confirmModal(
        'Replace your library customizations with this file? Built-in defaults are unaffected.',
        { variant: 'danger', confirmLabel: 'Replace' },
      );
      if (!ok) return;
    }
    setCustom(imported);
    app.toasts.show(
      `Library loaded: ${imported.equipment.length} equipment, ${imported.creatures.length} creature, ${imported.spells.length} spell, ${imported.feats.length} feat entries.`,
    );
  });

  mustGetElement('library-reset-btn').addEventListener('click', async () => {
    if (isLibraryEmpty(custom)) {
      app.toasts.show('No library customizations to remove.');
      return;
    }
    const ok = await confirmModal(
      'Remove all library customizations? Built-in defaults are unaffected. Export first to keep a copy.',
      { variant: 'danger', confirmLabel: 'Reset' },
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
