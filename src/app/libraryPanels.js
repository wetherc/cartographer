import { mustGetElement } from '../ui/dom.js';
import { mountLibraryPanel } from '../ui/LibraryPanel.js';
import { buildItemForm } from '../ui/ItemForm.js';
import { buildSpellForm } from '../ui/SpellForm.js';
import { buildCreatureTemplateForm } from '../ui/CreatureTemplateForm.js';
import { buildFeatForm } from '../ui/FeatForm.js';
import {
  equipmentKey,
  nameKey,
  activeEquipmentEntries,
  activeCreatureEntries,
  activeSpellEntries,
  activeFeatEntries,
  upsertEntry,
  removeEntry,
  renameConflict,
  DEFAULT_CREATURES,
  DEFAULT_FEATS,
} from '../library/Library.js';
import { DEFAULT_SPELLS } from '../data/spells.js';
import { creatureForm } from './creatureForm.js';
import {
  creatureSummary,
  equipmentSummary,
  featSummary,
  spellSummary,
} from './librarySummaries.js';
import { creatureTags, spellTags } from '../library/LibraryFacets.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/library.js').CustomLibrary} CustomLibrary */
/** @typedef {import('../types/library.js').EquipmentTemplate} EquipmentTemplate */
/** @typedef {import('../types/library.js').LibrarySource} LibrarySource */

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
 * The store for one list keyed by name, built by `makeKeyedStore` in
 * libraryWiring.js. It returns true when the entry is stored.
 * @typedef {(key: string | null, fields: any) => boolean} KeyedStore
 */

/**
 * Mount the equipment, creature, spell, and feat lists of Library mode.
 * libraryWiring.js owns the custom library and passes in the functions that
 * write to it.
 * @param {AppContext} app
 * @param {{
 *   updateCustom: (edit: (base: CustomLibrary) => CustomLibrary) => void,
 *   makeRemoveHandler: (noun: string, apply: (key: string) => void) => (key: string, source: string) => Promise<boolean>,
 *   makeKeyedStore: (
 *     list: 'creatures' | 'spells' | 'feats',
 *     noun: string,
 *     activeEntries: () => { entry: { id: string, name: string }, source: LibrarySource }[],
 *     defaults: { id: string }[],
 *   ) => KeyedStore,
 * }} deps
 * @returns {{ update: () => void }[]}
 */
export function mountEntryPanels(app, { updateCustom, makeRemoveHandler, makeKeyedStore }) {
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
            summary: equipmentSummary(entry),
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
              ...found.entry,
            })
          : null,
        template: true,
        submitLabel: found ? 'Save' : 'Add',
        onCancel: close,
        onSubmit: (fields) => {
          const { quantity: _quantity, ...rest } = fields;
          const entry = /** @type {EquipmentTemplate} */ (rest);
          const newKey = equipmentKey(entry);
          const target = activeEquipmentEntries().find((e) => equipmentKey(e.entry) === newKey);
          if (renameConflict({ found, target, renamed: key !== newKey })) {
            app.toasts.show(
              `Another item is already named "${entry.name.trim()}". Choose a different name.`,
              { level: 'error' },
            );
            return;
          }
          // A rename or a type change removes the old custom entry instead
          // of leaving both. Renaming a default only adds the renamed copy.
          // A rename onto the name and type of another entry is refused,
          // because the upsert would replace that entry.
          updateCustom((base) => {
            const moved = key && key !== newKey;
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
    facets: [{ id: 'cr', label: 'Challenge rating', all: 'Any CR' }],
    subtabs: CREATURE_SUBTABS,
    getEntries: (subtab) =>
      activeCreatureEntries()
        .filter(({ entry }) => (entry.disposition === 'hostile') === (subtab === 'foes'))
        .map(({ entry, source }) => ({
          key: nameKey(entry),
          name: entry.name,
          summary: creatureSummary(entry),
          source,
          tags: creatureTags(entry),
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
    facets: [
      { id: 'class', label: 'Class', all: 'All classes' },
      { id: 'level', label: 'Level', all: 'All levels' },
      { id: 'school', label: 'School', all: 'All schools' },
    ],
    getEntries: () =>
      activeSpellEntries()
        .slice()
        .sort((a, b) => a.entry.level - b.entry.level || a.entry.name.localeCompare(b.entry.name))
        .map(({ entry, source }) => ({
          key: nameKey(entry),
          name: entry.name,
          summary: spellSummary(entry),
          source,
          tags: spellTags(entry),
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
  return [equipmentPanel, creaturePanel, spellPanel, featPanel];
}
