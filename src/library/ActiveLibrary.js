/**
 * The active library registry. This is the one deliberate piece of module
 * state in the project. The pickers that offer presets (the item form, the
 * enemy gear selects, "From bestiary") mount far from the wiring that loads
 * the GM's customizations. These getters let the pickers read the merged
 * lists directly, instead of passing a library through every mount call.
 * libraryWiring sets this state at startup and after every edit or import.
 * Each getter applies the pure merge of `LibraryMerge.js` to the registered
 * custom entries.
 */

import { WEAPON_TYPES } from '../entities/Equipment.js';
import { DEFAULT_SPELLS } from '../data/spells.js';
import { DEFAULT_FEATS } from '../data/feats.js';
import { DEFAULT_CREATURES } from '../data/creatures.js';
import { DEFAULT_TABLES } from '../data/tables.js';
import { coerceEnemyArmor } from '../entities/EnemyArmor.js';
import { indexById } from '../util/indexById.js';
import {
  defaultEquipmentTemplates,
  emptyLibrary,
  equipmentKey,
  mergedEntries,
  nameKey,
} from './LibraryMerge.js';

/** @typedef {import('../types/library.js').EquipmentTemplate} EquipmentTemplate */
/** @typedef {import('../types/library.js').CustomLibrary} CustomLibrary */
/** @typedef {import('../types/library.js').LibrarySource} LibrarySource */
/** @typedef {import('../types/creature.js').CreatureTemplate} CreatureTemplate */
/** @typedef {import('../types/spell.js').Spell} Spell */
/** @typedef {import('../types/feat.js').Feat} Feat */

/** @type {CustomLibrary} */
let active = emptyLibrary();

/**
 * Merged lists derived from `active`. The module builds these lazily and
 * keeps them until the next call to setActiveLibrary. Every getter below
 * runs repeatedly on each library render and picker open. Without this
 * cache, each call rebuilds the defaults and reruns the merge.
 * @type {{
 *   equipment?: { entry: EquipmentTemplate, source: LibrarySource }[],
 *   equipmentAll?: EquipmentTemplate[],
 *   equipmentByType?: Map<string, EquipmentTemplate[]>,
 *   weapons?: EquipmentTemplate[],
 *   armors?: import('../types/entities.js').CreatureArmor[],
 *   creatures?: { entry: CreatureTemplate, source: LibrarySource }[],
 *   creatureList?: CreatureTemplate[],
 *   spells?: { entry: Spell, source: LibrarySource }[],
 *   spellList?: Spell[],
 *   spellIndex?: Map<string, Spell>,
 *   feats?: { entry: Feat, source: LibrarySource }[],
 *   featList?: Feat[],
 *   tables?: { entry: import('../types/table.js').RandomTable, source: LibrarySource }[],
 * }}
 */
let cache = {};

/** @param {CustomLibrary} library */
export function setActiveLibrary(library) {
  active = library;
  cache = {};
}

/** @returns {CustomLibrary} */
export function getActiveLibrary() {
  return active;
}

/** The merged equipment list: defaults plus the active customizations,
 * tagged by source. Default order comes first, with new custom entries
 * appended.
 * @returns {{ entry: EquipmentTemplate, source: LibrarySource }[]} */
export function activeEquipmentEntries() {
  return (cache.equipment ??= mergedEntries(
    defaultEquipmentTemplates(),
    active.equipment,
    equipmentKey,
  ));
}

/** The merged equipment templates of one item type, for example the weapon
 * picker's choices. Omit the type argument for the whole list.
 * @param {import('../types/entities.js').ItemType} [type]
 * @returns {EquipmentTemplate[]} */
export function activeEquipment(type) {
  const all = (cache.equipmentAll ??= activeEquipmentEntries().map((e) => e.entry));
  if (type === undefined) return all;
  const byType = (cache.equipmentByType ??= new Map());
  let list = byType.get(type);
  if (!list) {
    list = all.filter((e) => e.type === type);
    byType.set(type, list);
  }
  return list;
}

/** Every merged template that an enemy can use as a weapon: weapon-typed,
 * with a damage roll.
 * @returns {EquipmentTemplate[]} */
export function activeWeapons() {
  return (cache.weapons ??= activeEquipmentEntries()
    .map((e) => e.entry)
    .filter((e) => WEAPON_TYPES.includes(e.type) && (e.damage?.length ?? 0) > 0));
}

/** Every merged body-armor template as an enemy armor choice: the name, the
 * base AC, and the weight class.
 * @returns {import('../types/entities.js').CreatureArmor[]} */
export function activeArmors() {
  return (cache.armors ??= activeEquipmentEntries()
    .map((e) => e.entry)
    .filter((e) => e.type === 'armor' && e.baseAC !== undefined)
    .map((e) => /** @type {import('../types/entities.js').CreatureArmor} */ (coerceEnemyArmor(e))));
}

/** A merged armor template as an enemy's worn armor, or null for an unknown
 * name. This function is the library-aware twin of enemyArmor in
 * Equipment.js.
 * @param {string} name
 * @returns {import('../types/entities.js').CreatureArmor | null} */
export function activeEnemyArmor(name) {
  // This copies the entry out. The merged list is memoized and shared, so
  // passing one of its elements directly to an encounter puts library
  // data inside campaign state.
  const found = activeArmors().find((a) => a.name === name);
  return found ? { ...found } : null;
}

/** The merged creature templates: built-in stock enemies and townsfolk plus
 * the active customizations, tagged by source.
 * @returns {{ entry: CreatureTemplate, source: LibrarySource }[]} */
export function activeCreatureEntries() {
  return (cache.creatures ??= mergedEntries(DEFAULT_CREATURES, active.creatures, nameKey));
}

/** The merged creature templates, for spawn pickers.
 * @returns {CreatureTemplate[]} */
export function activeCreatures() {
  return (cache.creatureList ??= activeCreatureEntries().map((e) => e.entry));
}

/** A merged creature template by name, or null for a name no entry carries.
 * The name is the merge key, so a summoning spell that names a template still
 * finds it after a GM customizes that template. The comparison ignores case
 * and surrounding spaces, the same way the merge does.
 * @param {string} name
 * @returns {CreatureTemplate | null} */
export function activeCreatureByName(name) {
  const key = nameKey({ name });
  return activeCreatures().find((t) => nameKey(t) === key) ?? null;
}

/** The merged spell list: curated built-ins plus the active customizations,
 * tagged by source.
 * @returns {{ entry: Spell, source: LibrarySource }[]} */
export function activeSpellEntries() {
  return (cache.spells ??= mergedEntries(DEFAULT_SPELLS, active.spells, nameKey));
}

/** The merged spells, for spellbook pickers and the casting resolver.
 * @returns {Spell[]} */
export function activeSpells() {
  return (cache.spellList ??= activeSpellEntries().map((e) => e.entry));
}

/** The merged spells, indexed by id and memoized alongside the merge.
 * Casting and spellbook rendering can then resolve a spell id in O(1) time,
 * instead of a linear scan.
 * @returns {Map<string, Spell>} */
export function activeSpellIndex() {
  return (cache.spellIndex ??= indexById(activeSpells()));
}

/** The merged feat list: the built-in catalog plus the active
 * customizations, tagged by source.
 * @returns {{ entry: Feat, source: LibrarySource }[]} */
export function activeFeatEntries() {
  return (cache.feats ??= mergedEntries(DEFAULT_FEATS, active.feats, nameKey));
}

/** The merged feats, for the take-feat picker.
 * @returns {Feat[]} */
export function activeFeats() {
  return (cache.featList ??= activeFeatEntries().map((e) => e.entry));
}

/** The merged random tables: the built-in examples plus the active
 * customizations, tagged by source.
 * @returns {{ entry: import('../types/table.js').RandomTable, source: LibrarySource }[]} */
export function activeTableEntries() {
  return (cache.tables ??= mergedEntries(
    /** @type {import('../types/table.js').RandomTable[]} */ (DEFAULT_TABLES),
    active.tables,
    nameKey,
  ));
}

/** A merged feat by name, or null for a name no entry carries. The name is
 * the merge key, so a character's stamped feat name still finds its entry
 * after a GM customizes it. The comparison ignores case and surrounding
 * spaces, the same way the merge does.
 * @param {string} name
 * @returns {Feat | null} */
/**
 * Resolve stored spell ids to Spell objects through the memoized index. This
 * function removes duplicate ids and drops any id the library no longer
 * knows, for example a spell removed from the custom library. This is the
 * one path from id to Spell for spellbook rendering and casting, so every
 * consumer agrees on ordering and on how it handles an unknown id.
 * @param {string[]} ids
 * @returns {Spell[]}
 */
export function resolveSpellIds(ids) {
  const index = activeSpellIndex();
  return [...new Set(ids)].flatMap((id) => {
    const spell = index.get(id);
    return spell ? [spell] : [];
  });
}
