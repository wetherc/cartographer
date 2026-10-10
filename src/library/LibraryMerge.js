/**
 * The built-in library lists and the pure merge of custom entries over
 * them. A custom entry replaces the default with the same merge key, and
 * the other custom entries append after the defaults.
 */

import {
  WEAPON_PRESETS,
  ARMOR_PRESETS,
  SHIELD_PRESETS,
  GEAR_PRESETS,
  CONSUMABLE_PRESETS,
} from '../entities/EquipmentPresets.js';
import { deepFreeze } from '../util/deepFreeze.js';

/** @typedef {import('../types/library.js').EquipmentTemplate} EquipmentTemplate */
/** @typedef {import('../types/library.js').CustomLibrary} CustomLibrary */
/** @typedef {import('../types/library.js').LibrarySource} LibrarySource */

/** @type {EquipmentTemplate[] | null} */
let defaultEquipment = null;

/**
 * The application's built-in equipment. This is one flat template list, built
 * from the 5e preset arrays in Equipment.js. The item form's preset pickers
 * and the enemy gear pickers use these same entries. The function builds the
 * list once and freezes it, so every call shares one read-only list, like the
 * other three built-in catalogs, instead of copying it each time.
 * @returns {EquipmentTemplate[]}
 */
export function defaultEquipmentTemplates() {
  return (defaultEquipment ??= deepFreeze([
    ...WEAPON_PRESETS.map((p) => ({
      name: p.name,
      type: p.type,
      kind: p.kind,
      category: p.category,
      ...(p.properties ? { properties: [...p.properties] } : {}),
      ...(p.range ? { range: { ...p.range } } : {}),
      ...(p.versatileDamage ? { versatileDamage: p.versatileDamage.map((d) => ({ ...d })) } : {}),
      damage: p.damage.map((d) => ({ ...d })),
    })),
    ...ARMOR_PRESETS.map((p) => ({
      name: p.name,
      type: /** @type {import('../types/entities.js').ItemType} */ ('armor'),
      armorWeight: p.armorWeight,
      baseAC: p.baseAC,
      ...(p.stealthDisadvantage ? { stealthDisadvantage: true } : {}),
      ...(p.strength ? { strength: p.strength } : {}),
    })),
    ...SHIELD_PRESETS.map((p) => ({
      name: p.name,
      type: /** @type {import('../types/entities.js').ItemType} */ ('shield'),
      acBonus: p.acBonus,
    })),
    ...GEAR_PRESETS.map((p) => ({
      name: p.name,
      type: /** @type {import('../types/entities.js').ItemType} */ ('gear'),
      description: p.description,
      ...(p.spellFocus ? { spellFocus: true } : {}),
      ...(p.light ? { light: true } : {}),
    })),
    ...CONSUMABLE_PRESETS.map((p) => ({
      name: p.name,
      type: /** @type {import('../types/entities.js').ItemType} */ ('consumable'),
      description: p.description,
      ...(p.heals ? { heals: { ...p.heals } } : {}),
    })),
  ]));
}

/** @returns {CustomLibrary} A library with no customizations. */
export function emptyLibrary() {
  return { equipment: [], creatures: [], spells: [], feats: [] };
}

/** True when a custom library has no entries in any list.
 * @param {CustomLibrary} library
 * @returns {boolean} */
export function isLibraryEmpty(library) {
  return (
    library.equipment.length === 0 &&
    library.creatures.length === 0 &&
    library.spells.length === 0 &&
    library.feats.length === 0
  );
}

/** The merge key for an equipment template. A custom entry replaces a
 * default only when both the name (case-insensitive) and the item type
 * match. This stops a homebrew gear item named "Dagger" from replacing the
 * weapon of the same name.
 * @param {EquipmentTemplate} entry
 * @returns {string} */
export const equipmentKey = (entry) => `${entry.type}:${entry.name.trim().toLowerCase()}`;

/** The merge key for creature and spell templates. The key is the
 * name, case-insensitive.
 * @param {{ name: string }} entry
 * @returns {string} */
export const nameKey = (entry) => entry.name.trim().toLowerCase();

/**
 * Merge custom entries over a default list. A custom entry whose key matches
 * a default replaces that default in place, with source 'override'. The rest
 * append in their own order, with source 'custom'. This function expects one
 * custom entry per key. Two entries with the same key resolve as last-wins
 * in the override branch, and first-wins in the append loop.
 * normalizeLibrary guarantees one entry per key for every loaded library, and
 * upsertEntry guarantees it for every edit. This function is pure.
 * @template {object} T
 * @param {T[]} defaults
 * @param {T[]} customs
 * @param {(entry: T) => string} keyOf
 * @returns {{ entry: T, source: LibrarySource }[]}
 */
export function mergedEntries(defaults, customs, keyOf) {
  const customByKey = new Map(customs.map((c) => [keyOf(c), c]));
  /** @type {{ entry: T, source: LibrarySource }[]} */
  const out = [];
  const placed = new Set();
  for (const entry of defaults) {
    const key = keyOf(entry);
    const custom = customByKey.get(key);
    out.push(custom ? { entry: custom, source: 'override' } : { entry, source: 'default' });
    placed.add(key);
  }
  for (const entry of customs) {
    const key = keyOf(entry);
    if (placed.has(key)) continue;
    out.push({ entry, source: 'custom' });
    placed.add(key);
  }
  return out;
}

/**
 * Insert or replace a custom entry by key. This function is pure.
 * @template {object} T
 * @param {T[]} customs
 * @param {T} entry
 * @param {(entry: T) => string} keyOf
 * @returns {T[]}
 */
export function upsertEntry(customs, entry, keyOf) {
  const key = keyOf(entry);
  const index = customs.findIndex((c) => keyOf(c) === key);
  if (index === -1) return [...customs, entry];
  return customs.map((c, i) => (i === index ? entry : c));
}

/**
 * Remove the custom entry with the given key. This removes a custom entry,
 * or reverts an override back to its default. This function is pure.
 * @template {object} T
 * @param {T[]} customs
 * @param {string} key
 * @param {(entry: T) => string} keyOf
 * @returns {T[]}
 */
export function removeEntry(customs, key, keyOf) {
  return customs.filter((c) => keyOf(c) !== key);
}
