import { WEAPON_TYPES, ITEM_TYPES, DIE_SIZES, DAMAGE_TYPES } from '../entities/Equipment.js';
import {
  DEFAULT_SPELLS,
  SPELL_SCHOOLS,
  SPELL_ABILITIES,
  SPELL_EFFECT_KINDS,
} from '../data/spells.js';
import {
  WEAPON_PRESETS,
  ARMOR_PRESETS,
  GEAR_PRESETS,
  CONSUMABLE_PRESETS,
} from '../entities/EquipmentPresets.js';
import { normalizeStatBlock } from '../entities/Modifiers.js';
import { DISPOSITIONS } from '../entities/NPC.js';
import { isCasterClass } from '../entities/Classes.js';
import { slugId } from '../entities/Roster.js';
import { indexById } from '../util/indexById.js';

/** @typedef {import('../types/library.js').EquipmentTemplate} EquipmentTemplate */
/** @typedef {import('../types/library.js').NPCTemplate} NPCTemplate */
/** @typedef {import('../types/library.js').CustomLibrary} CustomLibrary */
/** @typedef {import('../types/library.js').LibrarySource} LibrarySource */
/** @typedef {import('../types/entities.js').EncounterTemplate} EncounterTemplate */
/** @typedef {import('../types/spell.js').Spell} Spell */
/** @typedef {import('../types/entities.js').DamagePart} DamagePart */

/**
 * The application's built-in equipment, one flat template list assembled from
 * the 5e preset arrays in Equipment.js — the same entries the item form's
 * preset pickers and the enemy gear pickers have always offered.
 * @returns {EquipmentTemplate[]}
 */
export function defaultEquipmentTemplates() {
  return [
    ...WEAPON_PRESETS.map((p) => ({
      name: p.name,
      type: p.type,
      handling: p.handling,
      damage: p.damage.map((d) => ({ ...d })),
    })),
    ...ARMOR_PRESETS.map((p) => ({
      name: p.name,
      type: /** @type {import('../types/entities.js').ItemType} */ ('armor'),
      armorWeight: p.armorWeight,
      baseAC: p.baseAC,
    })),
    ...GEAR_PRESETS.map((p) => ({
      name: p.name,
      type: /** @type {import('../types/entities.js').ItemType} */ ('gear'),
      description: p.description,
    })),
    ...CONSUMABLE_PRESETS.map((p) => ({
      name: p.name,
      type: /** @type {import('../types/entities.js').ItemType} */ ('consumable'),
      description: p.description,
    })),
  ];
}

/**
 * The application's built-in bestiary: a handful of 5e-flavored stock enemies
 * so "From bestiary" works out of the box. Effective AC is the stat block's
 * AC plus the armor's bonus, matching effectiveStatBlock.
 * @type {EncounterTemplate[]}
 */
export const DEFAULT_BESTIARY = [
  {
    id: 'goblin',
    name: 'Goblin',
    maxHP: 7,
    statBlock: { STR: 8, DEX: 14, CON: 10, INT: 10, WIS: 8, CHA: 8, AC: 14 },
    level: 1,
    tier: 'mob',
    weapon: {
      name: 'Scimitar',
      handling: 'finesse',
      damage: [{ count: 1, sides: 6, damageType: 'slashing' }],
    },
    armor: { name: 'Leather Armor', acBonus: 1 },
  },
  {
    id: 'wolf',
    name: 'Wolf',
    maxHP: 11,
    statBlock: { STR: 12, DEX: 15, CON: 12, INT: 3, WIS: 12, CHA: 6, AC: 13 },
    level: 1,
    tier: 'mob',
    weapon: {
      name: 'Bite',
      handling: 'melee',
      damage: [{ count: 2, sides: 4, damageType: 'piercing' }],
    },
    armor: null,
  },
  {
    id: 'bandit',
    name: 'Bandit',
    maxHP: 11,
    statBlock: { STR: 11, DEX: 12, CON: 12, INT: 10, WIS: 10, CHA: 10, AC: 11 },
    level: 1,
    tier: 'mob',
    weapon: {
      name: 'Shortsword',
      handling: 'finesse',
      damage: [{ count: 1, sides: 6, damageType: 'piercing' }],
    },
    armor: { name: 'Leather Armor', acBonus: 1 },
  },
  {
    id: 'skeleton',
    name: 'Skeleton',
    maxHP: 13,
    statBlock: { STR: 10, DEX: 14, CON: 15, INT: 6, WIS: 8, CHA: 5, AC: 12 },
    level: 1,
    tier: 'mob',
    weapon: {
      name: 'Shortsword',
      handling: 'finesse',
      damage: [{ count: 1, sides: 6, damageType: 'piercing' }],
    },
    armor: { name: 'Armor Scraps', acBonus: 1 },
  },
  {
    id: 'orc',
    name: 'Orc',
    maxHP: 15,
    statBlock: { STR: 16, DEX: 12, CON: 16, INT: 7, WIS: 11, CHA: 10, AC: 11 },
    level: 2,
    tier: 'mob',
    weapon: {
      name: 'Greataxe',
      handling: 'melee',
      damage: [{ count: 1, sides: 12, damageType: 'slashing' }],
    },
    armor: { name: 'Hide', acBonus: 2 },
  },
  {
    id: 'ogre',
    name: 'Ogre',
    maxHP: 59,
    statBlock: { STR: 19, DEX: 8, CON: 16, INT: 5, WIS: 7, CHA: 7, AC: 9 },
    level: 4,
    tier: 'legend',
    weapon: {
      name: 'Greatclub',
      handling: 'melee',
      damage: [{ count: 2, sides: 8, damageType: 'bludgeoning' }],
    },
    armor: { name: 'Hide', acBonus: 2 },
  },
];

/**
 * The application's built-in NPC archetypes: enough stock townsfolk that a GM
 * can drop a recognizable somebody onto the map without typing stats.
 * @type {NPCTemplate[]}
 */
export const DEFAULT_NPC_TEMPLATES = [
  {
    name: 'Innkeeper',
    role: 'Innkeeper',
    disposition: 'friendly',
    notes: 'Keeps the local inn and hears every rumor worth a mug of ale.',
    stats: { STR: 10, DEX: 10, CON: 11, INT: 10, WIS: 11, CHA: 12 },
  },
  {
    name: 'Town Guard',
    role: 'Guard',
    disposition: 'neutral',
    notes: 'Watches the gate and asks pointed questions after dark.',
    stats: { STR: 13, DEX: 11, CON: 12, INT: 10, WIS: 10, CHA: 10 },
  },
  {
    name: 'Traveling Merchant',
    role: 'Merchant',
    disposition: 'friendly',
    notes: "Buys and sells oddities; prices drift with the buyer's desperation.",
    stats: { STR: 9, DEX: 10, CON: 10, INT: 12, WIS: 11, CHA: 13 },
  },
  {
    name: 'Village Elder',
    role: 'Elder',
    disposition: 'friendly',
    notes: "Holds the settlement's history and the favors owed within it.",
    stats: { STR: 8, DEX: 8, CON: 10, INT: 12, WIS: 14, CHA: 11 },
  },
  {
    name: 'Cult Initiate',
    role: 'Cultist',
    disposition: 'hostile',
    notes: 'Serves a hidden master and carries a sign of the order.',
    stats: { STR: 11, DEX: 12, CON: 10, INT: 10, WIS: 8, CHA: 11 },
  },
];

/** @returns {CustomLibrary} no customizations */
export function emptyLibrary() {
  return { equipment: [], bestiary: [], npcs: [], spells: [] };
}

/** Whether a custom library holds any entries at all.
 * @param {CustomLibrary} library
 * @returns {boolean} */
export function isLibraryEmpty(library) {
  return (
    library.equipment.length === 0 &&
    library.bestiary.length === 0 &&
    library.npcs.length === 0 &&
    library.spells.length === 0
  );
}

/** The merge key for an equipment template: a custom entry shadows a default
 * only when both name (case-insensitive) and item type match, so a homebrew
 * gear item named "Dagger" doesn't swallow the weapon.
 * @param {EquipmentTemplate} entry
 * @returns {string} */
export const equipmentKey = (entry) => `${entry.type}:${entry.name.trim().toLowerCase()}`;

/** The merge key for bestiary, NPC, and spell templates: the name,
 * case-insensitive.
 * @param {{ name: string }} entry
 * @returns {string} */
export const nameKey = (entry) => entry.name.trim().toLowerCase();

/**
 * Merge custom entries over a default list: a custom entry whose key matches
 * a default replaces it in place (source 'override'); the rest append in
 * their own order (source 'custom'). Pure.
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
 * Insert or replace a custom entry by key. Pure.
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
 * Drop the custom entry with the given key — deleting a custom entry, or
 * reverting an override back to its default. Pure.
 * @template {object} T
 * @param {T[]} customs
 * @param {string} key
 * @param {(entry: T) => string} keyOf
 * @returns {T[]}
 */
export function removeEntry(customs, key, keyOf) {
  return customs.filter((c) => keyOf(c) !== key);
}

/**
 * The id a stored name-keyed entry (bestiary template or spell) should carry.
 * Ids are internal — only the name key merges — and campaign state stores them:
 * characters, bestiary templates, and NPC templates all hold spell ids, so a
 * custom entry keeps its id across a rename or every reference to it would be
 * dropped as unknown. A renamed default or override instead takes a fresh id,
 * because its old id still belongs to the built-in entry that resurfaces once
 * the override stops matching it. Pure.
 * @param {{ entry: { id: string }, source: LibrarySource } | null | undefined} found
 *   the merged entry being edited, or null when this is a new entry
 * @param {string | null} oldKey the name key the edit started from
 * @param {string} newKey the submitted name key
 * @param {() => string[]} takenIds ids a freshly derived slug must avoid
 * @returns {string}
 */
export function storedEntryId(found, oldKey, newKey, takenIds) {
  if (found && (oldKey === newKey || found.source === 'custom')) return found.entry.id;
  return slugId(newKey, takenIds());
}

/**
 * Coerce an unknown value into a clean DamagePart array, dropping terms that
 * aren't well-formed dice and clamping the rest onto the supported die sizes
 * and damage types. Pure.
 * @param {unknown} value
 * @returns {DamagePart[]}
 */
function normalizeDamageParts(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((p) => p && typeof p === 'object')
    .map((p) => ({
      count: Math.max(1, Math.floor(Number(p.count)) || 1),
      sides: DIE_SIZES.includes(Number(p.sides)) ? Number(p.sides) : DIE_SIZES[0],
      damageType: DAMAGE_TYPES.includes(p.damageType) ? p.damageType : DAMAGE_TYPES[0],
    }));
}

/**
 * Normalize one parsed spell into a valid Spell, defaulting descriptive fields
 * and repairing the effect into one of the four discriminated shapes. An
 * unrecognized effect kind falls back to a text-only utility effect, so a
 * malformed import still round-trips as a castable-nothing spell rather than
 * being dropped. Pure.
 * @param {Record<string, any>} raw
 * @param {string} id
 * @returns {Spell}
 */
function normalizeSpell(raw, id) {
  const kind = SPELL_EFFECT_KINDS.includes(raw.effect?.kind) ? raw.effect.kind : 'utility';
  /** @type {import('../types/spell.js').SpellEffect} */
  let effect;
  if (kind === 'attack') {
    effect = { kind: 'attack', damage: normalizeDamageParts(raw.effect.damage) };
  } else if (kind === 'save') {
    effect = {
      kind: 'save',
      saveAbility: SPELL_ABILITIES.includes(raw.effect.saveAbility)
        ? raw.effect.saveAbility
        : 'DEX',
      damage: normalizeDamageParts(raw.effect.damage),
      halfOnSave: !!raw.effect.halfOnSave,
      ...(typeof raw.effect.condition === 'string' && raw.effect.condition
        ? { condition: raw.effect.condition }
        : {}),
    };
  } else if (kind === 'heal') {
    effect = { kind: 'heal', healing: normalizeDamageParts(raw.effect.healing) };
  } else {
    effect = { kind: 'utility' };
  }

  const scalingDamage = normalizeDamageParts(raw.scaling?.damagePerLevel);
  const scalingTargets = Math.floor(Number(raw.scaling?.targetsPerLevel));
  const scaling =
    scalingDamage.length > 0 || scalingTargets > 0
      ? {
          ...(scalingDamage.length > 0 ? { damagePerLevel: scalingDamage } : {}),
          ...(scalingTargets > 0 ? { targetsPerLevel: scalingTargets } : {}),
        }
      : undefined;

  return {
    id,
    name: raw.name.trim(),
    level: Math.min(9, Math.max(0, Math.floor(Number(raw.level)) || 0)),
    school: SPELL_SCHOOLS.includes(raw.school) ? raw.school : SPELL_SCHOOLS[0],
    classes: Array.isArray(raw.classes) ? raw.classes.filter((c) => typeof c === 'string') : [],
    castingTime: typeof raw.castingTime === 'string' ? raw.castingTime : '1 action',
    range: typeof raw.range === 'string' ? raw.range : 'Self',
    components: Array.isArray(raw.components)
      ? raw.components.filter((c) => typeof c === 'string')
      : [],
    duration: typeof raw.duration === 'string' ? raw.duration : 'Instantaneous',
    concentration: !!raw.concentration,
    ritual: !!raw.ritual,
    description: typeof raw.description === 'string' ? raw.description : '',
    effect,
    ...(scaling ? { scaling } : {}),
  };
}

/**
 * Repair a parsed spellbook into `{ cantrips, known, prepared }` of string ids,
 * dropping anything non-string. A missing/garbage spellbook reads as empty.
 * @param {unknown} raw
 * @returns {import('../types/entities.js').Spellbook}
 */
function normalizeSpellbook(raw) {
  const list = (/** @type {unknown} */ v) =>
    Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  const s = /** @type {Record<string, unknown>} */ (raw && typeof raw === 'object' ? raw : {});
  return { cantrips: list(s.cantrips), known: list(s.known), prepared: list(s.prepared) };
}

/**
 * The caster fields to carry onto a bestiary/NPC template from parsed JSON: the
 * class, an optional caster level, and a repaired spellbook — but only when the
 * class is a real caster class, so a non-caster template stays clean. Returns an
 * object to spread into the template literal.
 * @param {Record<string, any>} e
 * @returns {{ class?: string, subclass?: string, casterLevel?: number, spellbook?: import('../types/entities.js').Spellbook }}
 */
function casterTemplateFrom(e) {
  if (!isCasterClass(e.class)) return {};
  return {
    class: e.class,
    ...(typeof e.subclass === 'string' ? { subclass: e.subclass } : {}),
    ...(Number.isFinite(Number(e.casterLevel))
      ? { casterLevel: Math.max(1, Math.floor(Number(e.casterLevel))) }
      : {}),
    spellbook: normalizeSpellbook(e.spellbook),
  };
}

/**
 * Normalize a parsed custom-library JSON of any provenance (an exported file,
 * a hand-edited one, garbage) into a valid CustomLibrary, dropping entries
 * missing their essentials rather than throwing. Bestiary templates get an id
 * (sluggified from the name when absent), a positive max HP, and a stat block
 * closed over the fixed stat set; NPC templates get every field defaulted and
 * an unknown disposition read as neutral; spells get an id, defaulted
 * descriptive fields, and a repaired effect (see normalizeSpell).
 * @param {unknown} parsed
 * @returns {CustomLibrary}
 */
export function normalizeLibrary(parsed) {
  const source = /** @type {Record<string, unknown>} */ (
    parsed && typeof parsed === 'object' ? parsed : {}
  );
  /** @type {(value: unknown) => Record<string, any>[]} */
  const arrayOf = (value) =>
    Array.isArray(value) ? value.filter((e) => e && typeof e === 'object') : [];

  const equipment = arrayOf(source.equipment)
    .filter((e) => typeof e.name === 'string' && e.name.trim() && ITEM_TYPES.includes(e.type))
    .map((e) => /** @type {EquipmentTemplate} */ ({ ...e, name: e.name.trim() }));

  /** @type {string[]} */
  const bestiaryIds = [];
  const bestiary = arrayOf(source.bestiary)
    .filter((e) => typeof e.name === 'string' && e.name.trim())
    .map((e) => {
      const name = e.name.trim();
      const id = typeof e.id === 'string' && e.id ? e.id : slugId(name, bestiaryIds);
      bestiaryIds.push(id);
      return /** @type {EncounterTemplate} */ ({
        id,
        name,
        maxHP: Math.max(1, Math.floor(Number(e.maxHP)) || 1),
        statBlock: normalizeStatBlock(typeof e.statBlock === 'object' ? e.statBlock : {}),
        level: Math.max(1, Math.floor(Number(e.level)) || 1),
        tier: e.tier === 'legend' ? 'legend' : 'mob',
        // null survives (deliberately unarmed); absent stays absent so a
        // default can stamp in; anything non-object drops.
        ...(e.weapon === null || (e.weapon && typeof e.weapon === 'object')
          ? { weapon: e.weapon }
          : {}),
        ...(e.armor === null || (e.armor && typeof e.armor === 'object') ? { armor: e.armor } : {}),
        ...casterTemplateFrom(e),
      });
    });

  const npcs = arrayOf(source.npcs)
    .filter((e) => typeof e.name === 'string' && e.name.trim())
    .map(
      (e) =>
        /** @type {NPCTemplate} */ ({
          name: e.name.trim(),
          role: typeof e.role === 'string' ? e.role : '',
          disposition: DISPOSITIONS.includes(e.disposition) ? e.disposition : 'neutral',
          notes: typeof e.notes === 'string' ? e.notes : '',
          stats: e.stats && typeof e.stats === 'object' ? e.stats : {},
          ...casterTemplateFrom(e),
        }),
    );

  /** @type {string[]} */
  const spellIds = [];
  const spells = arrayOf(source.spells)
    .filter((e) => typeof e.name === 'string' && e.name.trim())
    .map((e) => {
      const id = typeof e.id === 'string' && e.id ? e.id : slugId(e.name.trim(), spellIds);
      spellIds.push(id);
      return normalizeSpell(e, id);
    });

  return { equipment, bestiary, npcs, spells };
}

/* --------------------------------------------------------------------------
 * Active library registry. The one deliberate piece of module state in the
 * project: the pickers that offer presets (the item form, the enemy gear
 * selects, "From bestiary") are mounted far from the wiring that loads the
 * GM's customizations, so they read the merged lists through these getters
 * instead of having a library threaded through every mount call. libraryWiring
 * sets it at startup and after every edit/import; everything below it is the
 * pure merge logic above applied to the registered customs.
 * ------------------------------------------------------------------------ */

/** @type {CustomLibrary} */
let active = emptyLibrary();

/**
 * Merged lists derived from `active`, built lazily and kept until the next
 * setActiveLibrary. Every getter below is called repeatedly per library
 * render and picker open; without this, each call rebuilt the defaults and
 * re-ran the merge.
 * @type {{
 *   equipment?: { entry: EquipmentTemplate, source: LibrarySource }[],
 *   equipmentAll?: EquipmentTemplate[],
 *   equipmentByType?: Map<string, EquipmentTemplate[]>,
 *   weapons?: EquipmentTemplate[],
 *   armors?: import('../types/entities.js').EnemyArmor[],
 *   bestiary?: { entry: EncounterTemplate, source: LibrarySource }[],
 *   bestiaryList?: EncounterTemplate[],
 *   npcs?: { entry: NPCTemplate, source: LibrarySource }[],
 *   spells?: { entry: Spell, source: LibrarySource }[],
 *   spellList?: Spell[],
 *   spellIndex?: Map<string, Spell>,
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

/** The merged equipment list (defaults + the active customizations), tagged
 * by source, in default order with new custom entries appended.
 * @returns {{ entry: EquipmentTemplate, source: LibrarySource }[]} */
export function activeEquipmentEntries() {
  return (cache.equipment ??= mergedEntries(
    defaultEquipmentTemplates(),
    active.equipment,
    equipmentKey,
  ));
}

/** The merged equipment templates of one item type, e.g. the weapon picker's
 * choices. Pass no type for the whole list.
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

/** Every merged template usable as an enemy weapon: weapon-typed with a
 * damage roll.
 * @returns {EquipmentTemplate[]} */
export function activeWeapons() {
  return (cache.weapons ??= activeEquipmentEntries()
    .map((e) => e.entry)
    .filter((e) => WEAPON_TYPES.includes(e.type) && (e.damage?.length ?? 0) > 0));
}

/** Every merged body-armor template as an enemy armor choice: name plus the
 * flat bonus its base AC carries over the unarmored 10.
 * @returns {import('../types/entities.js').EnemyArmor[]} */
export function activeArmors() {
  return (cache.armors ??= activeEquipmentEntries()
    .map((e) => e.entry)
    .filter((e) => e.type === 'armor' && e.baseAC !== undefined)
    .map((e) => ({ name: e.name, acBonus: /** @type {number} */ (e.baseAC) - 10 })));
}

/** A merged armor template as an enemy's worn armor, or null for an unknown
 * name — the library-aware twin of Equipment.js's enemyArmor.
 * @param {string} name
 * @returns {import('../types/entities.js').EnemyArmor | null} */
export function activeEnemyArmor(name) {
  return activeArmors().find((a) => a.name === name) ?? null;
}

/** The merged bestiary (built-in stock enemies + the active customizations),
 * tagged by source.
 * @returns {{ entry: EncounterTemplate, source: LibrarySource }[]} */
export function activeBestiaryEntries() {
  return (cache.bestiary ??= mergedEntries(DEFAULT_BESTIARY, active.bestiary, nameKey));
}

/** The merged bestiary templates, for spawn pickers.
 * @returns {EncounterTemplate[]} */
export function activeBestiary() {
  return (cache.bestiaryList ??= activeBestiaryEntries().map((e) => e.entry));
}

/** The merged NPC templates, tagged by source.
 * @returns {{ entry: NPCTemplate, source: LibrarySource }[]} */
export function activeNPCEntries() {
  return (cache.npcs ??= mergedEntries(DEFAULT_NPC_TEMPLATES, active.npcs, nameKey));
}

/** The merged spell corpus (curated built-ins + the active customizations),
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

/** The merged spells indexed by id, memoized alongside the merge so casting and
 * spellbook rendering resolve spell ids in O(1) instead of a linear scan.
 * @returns {Map<string, Spell>} */
export function activeSpellIndex() {
  return (cache.spellIndex ??= indexById(activeSpells()));
}

/**
 * Resolve stored spell ids to Spell objects through the memoized index,
 * deduplicating and dropping ids the library no longer knows (a spell removed
 * from the custom library). The one id -> Spell path for spellbook rendering
 * and casting, so every consumer agrees on ordering and unknown-id handling.
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
