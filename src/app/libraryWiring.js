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
import { itemSummary, formatDamage } from '../entities/Equipment.js';
import { slugId } from '../entities/Roster.js';
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
 * bestiary, and NPC template lists, plus the export/import/reset controls for
 * the custom library. The custom library is deliberately not campaign state:
 * it persists in its own localStorage key, survives New/Import/Load example,
 * and round-trips through a portable JSON file the GM keeps in the gitignored
 * library/ directory — an empty browser auto-loads that file at startup.
 * @param {AppContext} app
 */
export function wireLibrary(app) {
  /** The live custom library; the active registry in Library.js mirrors it. */
  let custom = loadCustomLibrary() ?? emptyLibrary();
  const hadStored = loadCustomLibrary() !== null;

  /** Refresh all three lists after any library mutation. */
  const refresh = () => {
    app.views.libraryEquipment.update();
    app.views.libraryBestiary.update();
    app.views.libraryNPCs.update();
    app.views.librarySpells.update();
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
    onRemove: async (key, source) => {
      const ok = await confirmModal(
        source === 'override'
          ? 'Revert this entry to the built-in default?'
          : 'Delete this custom entry?',
        { danger: source === 'custom', confirmLabel: source === 'override' ? 'Revert' : 'Delete' },
      );
      if (ok) setCustom({ ...custom, equipment: removeEntry(custom.equipment, key, equipmentKey) });
      return ok;
    },
  });

  // --- Bestiary ------------------------------------------------------------

  /** Store a bestiary template edit under its (possibly renamed) key, deriving
   * the id from the name like the spell list does — the form owns the fields,
   * the caller owns identity and the merge key.
   * @param {string | null} key @param {Omit<EncounterTemplate, 'id'>} fields */
  const storeBestiary = (key, fields) => {
    const existing = key
      ? activeBestiaryEntries().find(({ entry }) => nameKey(entry) === key)?.entry
      : null;
    const id =
      existing && key === nameKey(fields)
        ? existing.id
        : slugId(
            nameKey(fields),
            [...DEFAULT_BESTIARY, ...custom.bestiary].map((t) => t.id),
          );
    /** @type {EncounterTemplate} */
    const template = { ...fields, id };
    let next = custom.bestiary;
    if (key && key !== nameKey(template)) next = removeEntry(next, key, nameKey);
    setCustom({ ...custom, bestiary: upsertEntry(next, template, nameKey) });
  };

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
    onRemove: async (key, source) => {
      const ok = await confirmModal(
        source === 'override'
          ? 'Revert this enemy to the built-in default?'
          : 'Delete this custom enemy?',
        { danger: source === 'custom', confirmLabel: source === 'override' ? 'Revert' : 'Delete' },
      );
      if (ok) setCustom({ ...custom, bestiary: removeEntry(custom.bestiary, key, nameKey) });
      return ok;
    },
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
    onRemove: async (key, source) => {
      const ok = await confirmModal(
        source === 'override'
          ? 'Revert this NPC template to the built-in default?'
          : 'Delete this custom NPC template?',
        { danger: source === 'custom', confirmLabel: source === 'override' ? 'Revert' : 'Delete' },
      );
      if (ok) setCustom({ ...custom, npcs: removeEntry(custom.npcs, key, nameKey) });
      return ok;
    },
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

  /** Store a spell edit under its (possibly renamed) key.
   * @param {string | null} key @param {Omit<Spell, 'id'>} fields */
  const storeSpell = (key, fields) => {
    // A spell's id is derived from its name (the merge key); an existing entry
    // keeps its id unless renamed. Editing a built-in stores a custom override.
    const existing = key
      ? activeSpellEntries().find(({ entry }) => nameKey(entry) === key)?.entry
      : null;
    const id = existing && key === nameKey(fields) ? existing.id : slugId(nameKey(fields), []);
    /** @type {Spell} */
    const spell = { ...fields, id };
    let next = custom.spells;
    if (key && key !== nameKey(spell)) next = removeEntry(next, key, nameKey);
    setCustom({ ...custom, spells: upsertEntry(next, spell, nameKey) });
  };

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
    onRemove: async (key, source) => {
      const ok = await confirmModal(
        source === 'override'
          ? 'Revert this spell to the built-in default?'
          : 'Delete this custom spell?',
        { danger: source === 'custom', confirmLabel: source === 'override' ? 'Revert' : 'Delete' },
      );
      if (ok) setCustom({ ...custom, spells: removeEntry(custom.spells, key, nameKey) });
      return ok;
    },
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
