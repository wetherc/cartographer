import { mustGetElement } from '../ui/dom.js';
import { confirmModal } from '../ui/Modal.js';
import { wireTabs } from '../ui/Tabs.js';
import { mountLibraryPanel } from '../ui/LibraryPanel.js';
import { buildItemForm } from '../ui/ItemForm.js';
import { buildSpellForm } from '../ui/SpellForm.js';
import { buildEncounterTemplateForm } from '../ui/EncounterTemplateForm.js';
import { buildNPCTemplateForm } from '../ui/NPCTemplateForm.js';
import {
  emptyLibrary,
  isLibraryEmpty,
  setActiveLibrary,
  equipmentKey,
  nameKey,
  activeEquipmentEntries,
  activeBestiaryEntries,
  activeNPCEntries,
  activeSpellEntries,
  upsertEntry,
  removeEntry,
  storedEntryId,
  DEFAULT_BESTIARY,
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
import { itemSummary, formatDamage } from '../entities/Equipment.js';
import { npcForm } from './npcForm.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/library.js').CustomLibrary} CustomLibrary */
/** @typedef {import('../types/library.js').EquipmentTemplate} EquipmentTemplate */
/** @typedef {import('../types/library.js').NPCTemplate} NPCTemplate */
/** @typedef {import('../types/entities.js').EncounterTemplate} EncounterTemplate */
/** @typedef {import('../types/spell.js').Spell} Spell */

/** A spell's one-line summary for its library row: level/school and its effect
 * kind, plus a concentration marker.
 * @param {Spell} spell
 * @returns {string} */
function spellSummary(spell) {
  const level = spell.level === 0 ? 'Cantrip' : `Level ${spell.level}`;
  return [`${level} ${spell.school}`, spell.effect.kind, spell.concentration ? 'concentration' : '']
    .filter(Boolean)
    .join(' | ');
}

/** Section headings for the equipment list, in display order. */
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

/** The equipment list's subtabs: each shows one category of item types. */
const EQUIPMENT_SUBTABS = [
  { id: 'weapons', label: 'Weapons', types: ['weapon', 'bow'] },
  { id: 'armor', label: 'Armor', types: ['armor', 'helmet', 'gloves', 'greaves', 'shield'] },
  { id: 'rings', label: 'Rings', types: ['ring'] },
  { id: 'consumables', label: 'Consumables', types: ['consumable'] },
  { id: 'gear', label: 'Gear', types: ['gear'] },
];

/**
 * The Library mode's rail: the merged (built-in + custom) equipment,
 * bestiary, NPC template, and spell lists, plus the export/import/reset controls for
 * the custom library. The custom library is deliberately not campaign state:
 * it persists in its own localStorage key, survives New/Import/Load example,
 * and round-trips through a portable JSON file the GM keeps in the gitignored
 * library/ directory — an empty browser auto-loads that file at startup.
 * @param {AppContext} app
 */
export function wireLibrary(app) {
  // One read: loadCustomLibrary parses and fully normalizes the stored JSON, so
  // asking twice did that work twice at startup just to learn whether anything
  // was stored. Null means nothing stored, which is what seeds from the file.
  const stored = loadCustomLibrary();
  /** The live custom library; the active registry in Library.js mirrors it. */
  let custom = stored ?? emptyLibrary();
  const hadStored = stored !== null;

  /**
   * Refresh all four lists after any library mutation, and the character panels
   * with them: the spellbook lists the catalog's spells, so an edited or deleted
   * entry has to reach it too. The party is wired after the library, and the
   * file seed below resolves at an unknown time, so the action may not exist yet.
   */
  const refresh = () => {
    app.views.libraryEquipment.update();
    app.views.libraryBestiary.update();
    app.views.libraryNPCs.update();
    app.views.librarySpells.update();
    app.actions.refreshSelectedCharacter?.();
  };

  /** Apply, persist, and re-render a new custom library. @param {CustomLibrary} next */
  const setCustom = (next) => {
    custom = next;
    setActiveLibrary(next);
    if (!saveCustomLibrary(next)) {
      app.toasts.show(
        'The library change could not be stored: browser storage is full. Export the library to keep it.',
      );
    }
    refresh();
  };

  /**
   * The shared onRemove handler behind every library list: removing an
   * override reverts the entry to its built-in default, removing a custom
   * entry deletes it outright — one place for that wording and the
   * danger-only-on-delete styling. `noun` names the entry kind in the
   * confirm; `apply` removes the confirmed key from the custom library.
   * @param {string} noun
   * @param {(key: string) => void} apply
   * @returns {(key: string, source: string) => Promise<boolean>}
   */
  const makeRemoveHandler = (noun, apply) => async (key, source) => {
    const ok = await confirmModal(
      source === 'override'
        ? `Revert this ${noun} to the built-in default?`
        : `Delete this custom ${noun}?`,
      { danger: source === 'custom', confirmLabel: source === 'override' ? 'Revert' : 'Delete' },
    );
    if (ok) apply(key);
    return ok;
  };

  /**
   * Store an edited name-keyed entry (bestiary template or spell) under its
   * possibly-renamed key: a rename retires the old custom entry rather than
   * leaving both behind, and editing a built-in stores a custom override. The
   * id comes from `storedEntryId`, which keeps a custom entry's id stable
   * across a rename so campaign references to it survive. The form owns the
   * fields; this owns identity and the merge key.
   * A freshly derived id avoids every id in the list's namespace — both the
   * built-in defaults and the stored customs — rather than only the ids
   * currently visible in the merged list: an overridden default's own id is
   * hidden by its override but resurfaces the moment that override is renamed
   * or removed, so a slug that reused it would make one of the two entries
   * unreachable through the last-wins id index.
   * @param {'bestiary' | 'spells'} list which custom-library list to write
   * @param {() => { entry: { id: string, name: string }, source: import('../types/library.js').LibrarySource }[]} activeEntries
   * @param {{ id: string }[]} defaults the list's built-in entries
   * @returns {(key: string | null, fields: { name: string }) => void}
   */
  const makeKeyedStore = (list, activeEntries, defaults) => (key, fields) => {
    const takenIds = () =>
      [...defaults, .../** @type {{ id: string }[]} */ (custom[list])].map((entry) => entry.id);
    const newKey = nameKey(fields);
    const merged = activeEntries();
    const found = key ? merged.find(({ entry }) => nameKey(entry) === key) : null;
    const target = merged.find(({ entry }) => nameKey(entry) === newKey);
    const id = storedEntryId({ found, target, renamed: key !== newKey, newKey, takenIds });
    const entry = /** @type {any} */ ({ ...fields, id });
    let next = /** @type {any[]} */ (custom[list]);
    if (key && key !== nameKey(entry)) next = removeEntry(next, key, nameKey);
    setCustom({ ...custom, [list]: upsertEntry(next, entry, nameKey) });
  };

  setActiveLibrary(custom);

  // Seed an empty browser from the library file, so a fresh clone (or a
  // cleared browser) picks the GM's customizations back up without a manual
  // import. A browser that already holds a library keeps it — the file is
  // hot-loaded explicitly through Import.
  if (!hadStored) {
    fetchLibraryFile().then((library) => {
      if (!library || isLibraryEmpty(library)) return;
      setCustom(library);
      app.toasts.show(`Loaded the custom library from ${LIBRARY_FILE}.`);
    });
  }

  wireTabs(mustGetElement('library-tabs'));

  // --- Equipment -----------------------------------------------------------

  app.views.libraryEquipment = mountLibraryPanel(mustGetElement('library-equipment-container'), {
    addLabel: 'New item',
    subtabs: EQUIPMENT_SUBTABS,
    getEntries: (subtab) => {
      const merged = activeEquipmentEntries();
      const category = EQUIPMENT_SUBTABS.find((s) => s.id === subtab) ?? EQUIPMENT_SUBTABS[0];
      // Order by type within the subtab so the group headings come out
      // contiguous; merged order (defaults first, customs appended) is
      // preserved within each type. Single-type subtabs skip the heading —
      // it would just repeat the tab's label.
      return category.types.flatMap((type) =>
        merged
          .filter(({ entry }) => entry.type === type)
          .map(({ entry, source }) => ({
            key: equipmentKey(entry),
            name: entry.name,
            summary:
              itemSummary(/** @type {import('../types/entities.js').InventoryItem} */ (entry)) ||
              entry.description ||
              '',
            source,
            group: category.types.length > 1 ? (TYPE_GROUPS[type] ?? type) : undefined,
          })),
      );
    },
    // The full item form, inline in the rail: editing a built-in default
    // stores the result as an override; a new name makes a new custom entry.
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
          let next = custom.equipment;
          // A rename (or type change) retires the old custom entry rather
          // than leaving both behind; renaming a default just adds the copy.
          if (key && key !== equipmentKey(entry)) next = removeEntry(next, key, equipmentKey);
          setCustom({ ...custom, equipment: upsertEntry(next, entry, equipmentKey) });
          close();
        },
      });
    },
    onRemove: makeRemoveHandler('entry', (key) =>
      setCustom({ ...custom, equipment: removeEntry(custom.equipment, key, equipmentKey) }),
    ),
  });

  // --- Bestiary ------------------------------------------------------------

  const storeBestiary = makeKeyedStore('bestiary', activeBestiaryEntries, DEFAULT_BESTIARY);

  app.views.libraryBestiary = mountLibraryPanel(mustGetElement('library-bestiary-container'), {
    addLabel: 'New enemy',
    getEntries: () =>
      activeBestiaryEntries().map(({ entry, source }) => ({
        key: nameKey(entry),
        name: entry.name,
        summary: [
          `${entry.maxHP} HP, level ${entry.level} ${entry.tier}`,
          entry.weapon ? `${entry.weapon.name} ${formatDamage(entry.weapon.damage)}` : '',
        ]
          .filter(Boolean)
          .join(' | '),
        source,
      })),
    // The full bestiary form, inline in the rail: editing a built-in default
    // stores the result as an override; a new name makes a new custom entry.
    buildEditor: (key, close) => {
      const found = key
        ? activeBestiaryEntries().find(({ entry }) => nameKey(entry) === key)
        : null;
      return buildEncounterTemplateForm({
        template: found?.entry ?? null,
        submitLabel: found ? 'Save' : 'Add',
        onCancel: close,
        onSubmit: (fields) => {
          storeBestiary(key, fields);
          close();
        },
      });
    },
    onRemove: makeRemoveHandler('enemy', (key) =>
      setCustom({ ...custom, bestiary: removeEntry(custom.bestiary, key, nameKey) }),
    ),
  });

  // --- NPC templates ---------------------------------------------------------

  /** Store an NPC template edit under its (possibly renamed) key.
   * @param {string | null} key @param {NPCTemplate} template */
  const storeNPCTemplate = (key, template) => {
    let next = custom.npcs;
    if (key && key !== nameKey(template)) next = removeEntry(next, key, nameKey);
    setCustom({ ...custom, npcs: upsertEntry(next, template, nameKey) });
  };

  app.views.libraryNPCs = mountLibraryPanel(mustGetElement('library-npcs-container'), {
    addLabel: 'New NPC template',
    getEntries: () =>
      activeNPCEntries().map(({ entry, source }) => ({
        key: nameKey(entry),
        name: entry.name,
        summary: [entry.role, entry.disposition].filter(Boolean).join(' — '),
        source,
      })),
    // The full NPC template form, inline in the rail like the item form.
    buildEditor: (key, close) => {
      const found = key ? activeNPCEntries().find(({ entry }) => nameKey(entry) === key) : null;
      return buildNPCTemplateForm({
        template: found?.entry ?? null,
        submitLabel: found ? 'Save' : 'Add',
        onCancel: close,
        onSubmit: (template) => {
          storeNPCTemplate(key, template);
          close();
        },
      });
    },
    onRemove: makeRemoveHandler('NPC template', (key) =>
      setCustom({ ...custom, npcs: removeEntry(custom.npcs, key, nameKey) }),
    ),
    // Spawn a campaign NPC from a template: the normal NPC dialog, pre-filled
    // from the blueprint, defaulting placement to the party's position.
    spawnLabel: 'Add to campaign',
    onSpawn: (key) => {
      const found = activeNPCEntries().find(({ entry }) => nameKey(entry) === key);
      if (!found) return;
      npcForm(app, null, { ...app.partyTracker.getPosition() }, found.entry);
    },
  });

  // --- Spells ----------------------------------------------------------------

  const storeSpell = makeKeyedStore('spells', activeSpellEntries, DEFAULT_SPELLS);

  app.views.librarySpells = mountLibraryPanel(mustGetElement('library-spells-container'), {
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
          storeSpell(key, fields);
          close();
        },
      });
    },
    onRemove: makeRemoveHandler('spell', (key) =>
      setCustom({ ...custom, spells: removeEntry(custom.spells, key, nameKey) }),
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
      app.toasts.show('That file is not a readable library JSON.');
      return;
    }
    if (!isLibraryEmpty(custom)) {
      const ok = await confirmModal(
        'Replace your library customizations with this file? Built-in defaults are unaffected.',
        { danger: true, confirmLabel: 'Replace' },
      );
      if (!ok) return;
    }
    setCustom(imported);
    app.toasts.show(
      `Library loaded: ${imported.equipment.length} equipment, ${imported.bestiary.length} bestiary, ${imported.npcs.length} NPC, ${imported.spells.length} spell entries.`,
    );
  });

  mustGetElement('library-reset-btn').addEventListener('click', async () => {
    if (isLibraryEmpty(custom)) {
      app.toasts.show('No library customizations to remove.');
      return;
    }
    const ok = await confirmModal(
      'Remove all library customizations? Built-in defaults are unaffected. Export first to keep a copy.',
      { danger: true, confirmLabel: 'Reset' },
    );
    if (!ok) return;
    custom = emptyLibrary();
    setActiveLibrary(custom);
    // Clear the stored key (rather than storing an empty library) so the next
    // page load can seed from the library file again.
    clearCustomLibrary();
    refresh();
    app.toasts.show('Library customizations removed.');
  });
}
