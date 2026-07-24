import { mustGetElement } from '../ui/dom.js';
import { promptModal, confirmModal } from '../ui/Modal.js';
import { wireTabs } from '../ui/Tabs.js';
import { mountLibraryPanel } from '../ui/LibraryPanel.js';
import { buildItemForm } from '../ui/ItemForm.js';
import {
  emptyLibrary,
  isLibraryEmpty,
  setActiveLibrary,
  equipmentKey,
  nameKey,
  activeEquipmentEntries,
  activeBestiaryEntries,
  activeNPCEntries,
  activeWeapons,
  activeArmors,
  activeEnemyArmor,
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
import { STAT_KEYS, defaultEnemyStats, ENEMY_TIERS } from '../entities/Modifiers.js';
import { DISPOSITIONS } from '../entities/NPC.js';
import { ABILITY_SCORES } from '../entities/Character.js';
import { slugId } from '../entities/Roster.js';
import { npcForm } from './npcForm.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/library.js').CustomLibrary} CustomLibrary */
/** @typedef {import('../types/library.js').EquipmentTemplate} EquipmentTemplate */
/** @typedef {import('../types/library.js').NPCTemplate} NPCTemplate */
/** @typedef {import('../types/entities.js').EncounterTemplate} EncounterTemplate */

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

  /**
   * The bestiary template create/edit dialog: the encounter form's blueprint
   * fields (no placement, no live HP). Creating re-stamps the stat defaults
   * as level/tier change until a stat is hand-edited, like the encounter form.
   * @param {EncounterTemplate | null} existing
   * @returns {Promise<EncounterTemplate | null>}
   */
  async function bestiaryForm(existing) {
    const weaponChoices = activeWeapons();
    const currentWeapon = existing?.weapon;
    const customWeapon = currentWeapon && !weaponChoices.some((p) => p.name === currentWeapon.name);
    // "None" (the empty value) marks a deliberately weaponless or unarmored
    // creature — a beast, an ooze — which then gets no attack button and no
    // stamped default gear.
    const weaponOptions = [
      { value: '', label: 'None (unarmed)' },
      ...(customWeapon
        ? [
            {
              value: currentWeapon.name,
              label: `${currentWeapon.name} (${formatDamage(currentWeapon.damage)})`,
            },
          ]
        : []),
      ...weaponChoices.map((p) => ({ value: p.name, label: p.name })),
    ];
    const armorChoices = activeArmors();
    const currentArmor = existing?.armor;
    const customArmor = currentArmor && !armorChoices.some((a) => a.name === currentArmor.name);
    const armorOptions = [
      { value: '', label: 'None (unarmored)' },
      ...(customArmor
        ? [
            {
              value: currentArmor.name,
              label: `${currentArmor.name} (+${currentArmor.acBonus} AC)`,
            },
          ]
        : []),
      ...armorChoices.map((a) => ({ value: a.name, label: `${a.name} (+${a.acBonus} AC)` })),
    ];
    const defaults = existing?.statBlock ?? defaultEnemyStats(1, 'mob');
    let statsTouched = false;
    const values = await promptModal(
      existing ? 'Edit bestiary entry' : 'New bestiary entry',
      [
        { name: 'name', label: 'Name', value: existing?.name ?? '' },
        {
          name: 'tier',
          label: 'Tier',
          type: 'select',
          value: existing?.tier ?? 'mob',
          options: ENEMY_TIERS.map((t) => ({ value: t, label: t === 'mob' ? 'Mob' : 'Legend' })),
        },
        { name: 'maxHP', label: 'Max HP', type: 'number', value: existing?.maxHP ?? 10, min: 1 },
        { name: 'level', label: 'Level', type: 'number', value: existing?.level ?? 1, min: 1 },
        {
          name: 'weapon',
          label: 'Weapon',
          type: 'select',
          value: currentWeapon?.name ?? '',
          options: weaponOptions,
        },
        {
          name: 'armor',
          label: 'Armor',
          type: 'select',
          value: currentArmor?.name ?? '',
          options: armorOptions,
        },
        ...STAT_KEYS.map((key) => ({
          name: `stat-${key}`,
          label: key,
          type: /** @type {'number'} */ ('number'),
          value: defaults[key],
          min: 1,
        })),
      ],
      {
        submitLabel: existing ? 'Save' : 'Add',
        wide: true,
        onChange: existing
          ? undefined
          : (name, form) => {
              if (name.startsWith('stat-')) {
                statsTouched = true;
                return;
              }
              if (statsTouched || (name !== 'level' && name !== 'tier')) return;
              const stats = defaultEnemyStats(
                Math.max(1, Number(form.get('level')) || 1),
                /** @type {import('../types/entities.js').EnemyTier} */ (form.get('tier')),
              );
              for (const key of STAT_KEYS) form.set(`stat-${key}`, stats[key]);
            },
      },
    );
    const name = values?.name.trim();
    if (!values || !name) return null;
    const preset = weaponChoices.find((p) => p.name === values.weapon);
    const weapon =
      values.weapon === ''
        ? null
        : preset
          ? {
              name: preset.name,
              handling: preset.handling ?? /** @type {const} */ ('melee'),
              damage: (preset.damage ?? []).map((d) => ({ ...d })),
            }
          : (currentWeapon ?? null);
    const armor =
      values.armor === '' ? null : (activeEnemyArmor(values.armor) ?? currentArmor ?? null);
    return {
      id:
        existing?.id ??
        slugId(
          name,
          [...DEFAULT_BESTIARY, ...custom.bestiary].map((t) => t.id),
        ),
      name,
      maxHP: Math.max(1, Number(values.maxHP) || 1),
      statBlock: Object.fromEntries(
        STAT_KEYS.map((key) => [key, Math.max(1, Number(values[`stat-${key}`]) || 10)]),
      ),
      level: Math.max(1, Number(values.level) || 1),
      tier: /** @type {import('../types/entities.js').EnemyTier} */ (values.tier),
      weapon,
      armor,
    };
  }

  /** Store a bestiary template edit under its (possibly renamed) key.
   * @param {string | null} key @param {EncounterTemplate | null} template */
  const storeBestiary = (key, template) => {
    if (!template) return false;
    let next = custom.bestiary;
    if (key && key !== nameKey(template)) next = removeEntry(next, key, nameKey);
    setCustom({ ...custom, bestiary: upsertEntry(next, template, nameKey) });
    return true;
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
    onAdd: async () => storeBestiary(null, await bestiaryForm(null)),
    onEdit: async (key) => {
      const found = activeBestiaryEntries().find(({ entry }) => nameKey(entry) === key);
      if (!found) return false;
      return storeBestiary(key, await bestiaryForm(found.entry));
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

  /**
   * The NPC template create/edit dialog: the NPC form's fields minus
   * placement, which belongs to a spawned NPC rather than its blueprint.
   * @param {NPCTemplate | null} existing
   * @returns {Promise<NPCTemplate | null>}
   */
  async function npcTemplateForm(existing) {
    const values = await promptModal(
      existing ? 'Edit NPC template' : 'New NPC template',
      [
        { name: 'name', label: 'Name', value: existing?.name ?? '' },
        { name: 'role', label: 'Role / faction', value: existing?.role ?? '' },
        {
          name: 'disposition',
          label: 'Disposition',
          type: 'select',
          value: existing?.disposition ?? 'neutral',
          options: DISPOSITIONS.map((d) => ({ value: d, label: d[0].toUpperCase() + d.slice(1) })),
        },
        { name: 'notes', label: 'Notes', value: existing?.notes ?? '', full: true },
        ...ABILITY_SCORES.map((key) => ({
          name: `stat-${key}`,
          label: key,
          type: /** @type {'number'} */ ('number'),
          value: existing?.stats[key] ?? 10,
          min: 1,
        })),
      ],
      { submitLabel: existing ? 'Save' : 'Add', wide: true },
    );
    const name = values?.name.trim();
    if (!values || !name) return null;
    return {
      name,
      role: values.role.trim(),
      disposition: /** @type {import('../types/npc.js').Disposition} */ (values.disposition),
      notes: values.notes.trim(),
      stats: Object.fromEntries(
        ABILITY_SCORES.map((key) => [key, Math.max(1, Number(values[`stat-${key}`]) || 10)]),
      ),
    };
  }

  /** @param {string | null} key @param {NPCTemplate | null} template */
  const storeNPCTemplate = (key, template) => {
    if (!template) return false;
    let next = custom.npcs;
    if (key && key !== nameKey(template)) next = removeEntry(next, key, nameKey);
    setCustom({ ...custom, npcs: upsertEntry(next, template, nameKey) });
    return true;
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
    onAdd: async () => storeNPCTemplate(null, await npcTemplateForm(null)),
    onEdit: async (key) => {
      const found = activeNPCEntries().find(({ entry }) => nameKey(entry) === key);
      if (!found) return false;
      return storeNPCTemplate(key, await npcTemplateForm(found.entry));
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
      `Library loaded: ${imported.equipment.length} equipment, ${imported.bestiary.length} bestiary, ${imported.npcs.length} NPC entries.`,
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
