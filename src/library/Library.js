import {
  WEAPON_TYPES,
  ITEM_TYPES,
  HEALING_TYPES,
  normalizeDamagePart,
} from '../entities/Equipment.js';
import { clampInt } from '../util/num.js';
import {
  MAX_TARGET_COUNT,
  normalizeMaterials,
  normalizeProjectiles,
  normalizeTargetCount,
} from '../entities/Casting.js';
import { parseCastingTime, parseDuration } from '../entities/SpellTiming.js';
import { normalizeRider } from '../entities/Riders.js';
import {
  DEFAULT_SPELLS,
  SPELL_SCHOOLS,
  SPELL_ABILITIES,
  SPELL_EFFECT_KINDS,
} from '../data/spells.js';
import {
  WEAPON_PRESETS,
  ARMOR_PRESETS,
  SHIELD_PRESETS,
  GEAR_PRESETS,
  CONSUMABLE_PRESETS,
  coerceWeapon,
} from '../entities/EquipmentPresets.js';
import { coerceCR } from '../data/challenge.js';
import { ABILITY_SCORES, normalizeStatBlock } from '../entities/Modifiers.js';
import { SKILL_IDS } from '../data/skills.js';
import { DEFAULT_FEATS, FEAT_EFFECT_KINDS } from '../data/feats.js';
import { DEFAULT_CREATURE_HP, DISPOSITIONS, defaultEnemyGear } from '../entities/Creature.js';
import { isCasterClass } from '../entities/Classes.js';
import { creatureProficiencyFields, ARMOR_PROFICIENCIES } from '../entities/Proficiencies.js';
import { idClaimer, renameConflict, storedEntryId } from './LibraryIdentity.js';
import { indexById } from '../util/indexById.js';
import { deepFreeze } from '../util/deepFreeze.js';
import { DEFAULT_CREATURES } from '../data/creatures.js';

/** @typedef {import('../types/library.js').EquipmentTemplate} EquipmentTemplate */
/** @typedef {import('../types/library.js').CustomLibrary} CustomLibrary */
/** @typedef {import('../types/library.js').LibrarySource} LibrarySource */
/** @typedef {import('../types/creature.js').CreatureTemplate} CreatureTemplate */
/** @typedef {import('../types/spell.js').Spell} Spell */
/** @typedef {import('../types/feat.js').Feat} Feat */
/** @typedef {import('../types/entities.js').DamagePart} DamagePart */

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
    })),
    ...CONSUMABLE_PRESETS.map((p) => ({
      name: p.name,
      type: /** @type {import('../types/entities.js').ItemType} */ ('consumable'),
      description: p.description,
    })),
  ]));
}

// The built-in creature and feat templates live with the other authored
// corpora in src/data/. The re-exports keep this module the one import site
// for the built-in defaults of every library kind.
export { DEFAULT_CREATURES, DEFAULT_FEATS };

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

// The id rules for the name-keyed lists live in LibraryIdentity.js. The
// re-export keeps this module the one import site for the library wiring.
export { storedEntryId, renameConflict };

/**
 * A raw weapon record with its weapon fields replaced by the coerced ones.
 * The five weapon fields and the legacy `handling` field come off the record
 * first, so a rejected value (for example `properties` written as an object)
 * cannot survive beside the clean field. This function is pure.
 * @param {Record<string, any>} raw
 * @returns {Record<string, any>}
 */
function withCoercedWeapon(raw) {
  const {
    handling: _handling,
    kind: _kind,
    category: _category,
    properties: _properties,
    range: _range,
    versatileDamage: _versatile,
    ...rest
  } = raw;
  return { ...rest, ...coerceWeapon(raw) };
}

/**
 * Coerce an unknown value into a clean DamagePart array. This function drops
 * terms that are not well-formed dice, and clamps the rest onto the
 * supported die sizes and damage types. This function is pure.
 * @param {unknown} value
 * @param {string[]} [allowed] The types these terms can carry. Damage types
 *   by default, or `HEALING_TYPES` for restorative dice.
 * @returns {DamagePart[]}
 */
function normalizeDamageParts(value, allowed = undefined) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((p) => p && typeof p === 'object')
    .map((p) => normalizeDamagePart(p, allowed));
}

/**
 * Normalize one parsed spell into a valid Spell. This function defaults
 * descriptive fields and repairs the effect into one of the discriminated
 * shapes. An unrecognized effect kind falls back to a
 * text-only utility effect. This way a malformed import still round-trips as
 * a spell that casts nothing, instead of being dropped. This function is
 * pure.
 * @param {Record<string, any>} raw
 * @param {string} id
 * @returns {Spell}
 */
function normalizeSpell(raw, id) {
  const kind = SPELL_EFFECT_KINDS.includes(raw.effect?.kind) ? raw.effect.kind : 'utility';
  // The creature name is the whole point of a summons, so an entry that names
  // none casts nothing and falls through to the utility arm below.
  const summons =
    kind === 'summons' && typeof raw.effect.creature === 'string' ? raw.effect.creature.trim() : '';
  /** @type {import('../types/spell.js').SpellEffect} */
  let effect;
  if (kind === 'attack') {
    // Projectiles stay absent when the entry says nothing. This matches the
    // single attack roll that every entry written before this field assumed.
    const projectiles = normalizeProjectiles(raw.effect.projectiles);
    effect = {
      kind: 'attack',
      damage: normalizeDamageParts(raw.effect.damage),
      ...(projectiles ? { projectiles } : {}),
    };
  } else if (kind === 'save') {
    const condition =
      typeof raw.effect.condition === 'string' && raw.effect.condition ? raw.effect.condition : '';
    // A rider rides the chip, so it means nothing without one, the same as a
    // repeated save.
    const rider = condition ? normalizeRider(raw.effect.rider) : null;
    effect = {
      kind: 'save',
      saveAbility: SPELL_ABILITIES.includes(raw.effect.saveAbility)
        ? raw.effect.saveAbility
        : 'DEX',
      damage: normalizeDamageParts(raw.effect.damage),
      halfOnSave: !!raw.effect.halfOnSave,
      ...(condition ? { condition } : {}),
      // A repeated save only has meaning alongside a condition, so it stays
      // absent otherwise. An entry written before this field reads as a
      // condition that runs for the spell's whole duration.
      ...(raw.effect.saveEnds && condition ? { saveEnds: true } : {}),
      ...(rider ? { rider } : {}),
    };
  } else if (kind === 'heal') {
    effect = { kind: 'heal', healing: normalizeDamageParts(raw.effect.healing, HEALING_TYPES) };
  } else if (kind === 'buff') {
    // An unnamed chip stays absent, and the cast falls back to the spell's
    // own name. A buff with neither a chip name nor a rider is still a valid
    // spell: it puts a chip named after itself on each target.
    const rider = normalizeRider(raw.effect.rider);
    effect = {
      kind: 'buff',
      ...(typeof raw.effect.condition === 'string' && raw.effect.condition.trim()
        ? { condition: raw.effect.condition.trim() }
        : {}),
      ...(rider ? { rider } : {}),
    };
  } else if (summons) {
    // A count holds to the same cap as a target count, because both put that
    // many creatures into one fight.
    effect = {
      kind: 'summons',
      creature: summons,
      count: clampInt(raw.effect.count, 1, MAX_TARGET_COUNT, 1),
      ...(clampInt(raw.effect.countPerStep, 0) > 0
        ? { countPerStep: clampInt(raw.effect.countPerStep, 0, MAX_TARGET_COUNT) }
        : {}),
    };
  } else {
    effect = { kind: 'utility' };
  }

  // Scaling dice add to whatever the effect deals. A heal spell's per-level
  // dice are restorative too.
  const scalingDamage = normalizeDamageParts(
    raw.scaling?.damagePerLevel,
    kind === 'heal' ? HEALING_TYPES : undefined,
  );
  const scalingTargets = clampInt(raw.scaling?.targetsPerLevel, 0);
  const scaling =
    scalingDamage.length > 0 || scalingTargets > 0
      ? {
          ...(scalingDamage.length > 0 ? { damagePerLevel: scalingDamage } : {}),
          ...(scalingTargets > 0 ? { targetsPerLevel: scalingTargets } : {}),
        }
      : undefined;

  // An absent target count stays absent. The resolver reads this as one
  // creature, so no entry written before this field existed becomes an area
  // spell by omission. The shared normalizer processes any value present.
  const targetCount =
    raw.targetCount === undefined || raw.targetCount === null
      ? undefined
      : normalizeTargetCount(raw.targetCount);

  // A named material is an M component, even when the entry did not list the
  // letter. The material block implies the M component. This function
  // repairs it here, not in the form, so an imported entry does not lose its
  // material the next time a GM edits it. The form only shows the material
  // fields when M is checked.
  const materials = normalizeMaterials(raw.materials);
  const letters = Array.isArray(raw.components)
    ? raw.components.filter((/** @type {unknown} */ c) => typeof c === 'string')
    : [];
  if (materials && !letters.includes('M')) letters.push('M');

  return {
    id,
    name: raw.name.trim(),
    level: clampInt(raw.level, 0, 9),
    school: SPELL_SCHOOLS.includes(raw.school) ? raw.school : SPELL_SCHOOLS[0],
    classes: Array.isArray(raw.classes) ? raw.classes.filter((c) => typeof c === 'string') : [],
    // Timing is structured, but an entry can carry either the object or the
    // printed string that an older library wrote. The parsers read both
    // forms, and keep anything unclassified as plain text.
    castingTime: parseCastingTime(raw.castingTime ?? '1 action'),
    range: typeof raw.range === 'string' ? raw.range : 'Self',
    components: letters,
    ...(materials ? { materials } : {}),
    duration: parseDuration(raw.duration ?? 'Instantaneous'),
    concentration: !!raw.concentration,
    ritual: !!raw.ritual,
    description: typeof raw.description === 'string' ? raw.description : '',
    ...(targetCount === undefined ? {} : { targetCount }),
    effect,
    ...(scaling ? { scaling } : {}),
  };
}

/**
 * Coerce a written pick-n choice into a clean one, or return null when the
 * value grants nothing. The value is either a `{ choose, from }` object or a
 * plain list, which reads as a fixed grant of everything it names. Options
 * outside the field's vocabulary drop, and an empty `from` on the object
 * shape means the whole vocabulary. This function is pure.
 * @param {unknown} value
 * @param {string[]} vocabulary Every option the field can grant.
 * @returns {import('../types/feat.js').ProficiencyChoice | null}
 */
function normalizeChoice(value, vocabulary) {
  const keep = (/** @type {unknown[]} */ list) =>
    /** @type {string[]} */ ([
      ...new Set(list.filter((v) => typeof v === 'string' && vocabulary.includes(v))),
    ]);
  if (Array.isArray(value)) {
    const from = keep(value);
    return from.length > 0 ? { choose: from.length, from } : null;
  }
  if (!value || typeof value !== 'object') return null;
  const raw = /** @type {Record<string, unknown>} */ (value);
  const from = keep(Array.isArray(raw.from) ? raw.from : []);
  const cap = from.length > 0 ? from.length : vocabulary.length;
  const choose = clampInt(raw.choose, 0, cap, 0);
  return choose > 0 ? { choose, from } : null;
}

/** A trimmed, deduplicated string list, for the free-text proficiency grants.
 * @param {unknown} value
 * @returns {string[]} */
function stringList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((v) => typeof v === 'string' && v.trim()).map((v) => v.trim()))];
}

/**
 * Normalize one parsed feat into a valid Feat. Descriptive fields default,
 * and each effect repairs into one of the discriminated shapes. An effect of
 * an unknown kind, or one that grants nothing after repair, drops from the
 * list rather than dropping the feat: a feat with no effects is still valid,
 * because its description carries the parts the engine cannot model. The
 * feat form assembles its draft through this same function, so a typed feat
 * and an imported one can never disagree. This function is pure.
 * @param {Record<string, any>} raw
 * @param {string} id
 * @returns {Feat}
 */
export function normalizeFeat(raw, id) {
  /** @type {import('../types/feat.js').FeatEffect[]} */
  const effects = (Array.isArray(raw.effects) ? raw.effects : [])
    .filter((e) => e && typeof e === 'object' && FEAT_EFFECT_KINDS.includes(e.kind))
    .flatMap(
      /** @returns {import('../types/feat.js').FeatEffect[]} */
      (/** @type {Record<string, any>} */ e) => {
        if (e.kind === 'asi') {
          // An empty list means any of the six abilities, so a garbled list
          // repairs to the widest choice instead of dropping the increase.
          // Keys match without case, so a hand-typed `str` narrows the list
          // the way the author meant instead of silently widening it.
          const written = (Array.isArray(e.abilities) ? e.abilities : []).map((a) =>
            typeof a === 'string' ? a.toUpperCase() : a,
          );
          const abilities = /** @type {import('../types/spell.js').Ability[]} */ (
            ABILITY_SCORES.filter((a) => written.includes(a))
          );
          return [{ kind: /** @type {'asi'} */ ('asi'), abilities }];
        }
        if (e.kind === 'rider') {
          const rider = normalizeRider(e.rider);
          return rider ? [{ kind: /** @type {'rider'} */ ('rider'), rider }] : [];
        }
        const skills = normalizeChoice(e.skills, SKILL_IDS);
        const saves = normalizeChoice(e.saves, ABILITY_SCORES);
        const expertise = normalizeChoice(e.expertise, SKILL_IDS);
        const armor = /** @type {import('../types/class.js').ArmorProficiency[]} */ (
          stringList(e.armor).filter((a) => ARMOR_PROFICIENCIES.includes(/** @type {never} */ (a)))
        );
        const tools = stringList(e.tools);
        const languages = stringList(e.languages);
        if (
          !skills &&
          !saves &&
          !expertise &&
          armor.length + tools.length + languages.length === 0
        ) {
          return [];
        }
        return [
          {
            kind: /** @type {'proficiency'} */ ('proficiency'),
            ...(skills ? { skills } : {}),
            ...(saves ? { saves } : {}),
            ...(expertise ? { expertise } : {}),
            ...(armor.length > 0 ? { armor } : {}),
            ...(tools.length > 0 ? { tools } : {}),
            ...(languages.length > 0 ? { languages } : {}),
          },
        ];
      },
    );
  const prerequisite = typeof raw.prerequisite === 'string' ? raw.prerequisite.trim() : '';
  return {
    id,
    name: raw.name.trim(),
    description: typeof raw.description === 'string' ? raw.description : '',
    ...(prerequisite ? { prerequisite } : {}),
    ...(raw.repeatable ? { repeatable: true } : {}),
    effects,
  };
}

/**
 * Repair a parsed spellbook into `{ cantrips, known, prepared }` of string
 * ids. This function drops anything that is not a string. A missing or
 * invalid spellbook reads as empty.
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
 * The caster fields to copy onto a creature template from parsed
 * JSON: the class, an optional caster level, and a repaired spellbook. The
 * function adds these fields only when the class is a real caster class, so
 * a non-caster template stays clean. It returns an object to spread into the
 * template literal.
 * @param {Record<string, any>} e
 * @returns {{ class?: string, subclass?: string, casterLevel?: number, spellbook?: import('../types/entities.js').Spellbook }}
 */
function casterTemplateFrom(e) {
  if (!isCasterClass(e.class)) return {};
  return {
    class: e.class,
    ...(typeof e.subclass === 'string' ? { subclass: e.subclass } : {}),
    // Only a written number counts. A null or absent level is left for the
    // creature's own level, or the level 1 default, to fill.
    ...(typeof e.casterLevel === 'number' && Number.isFinite(e.casterLevel)
      ? { casterLevel: clampInt(e.casterLevel, 1) }
      : {}),
    spellbook: normalizeSpellbook(e.spellbook),
  };
}

/**
 * Keep one entry per merge key. The last entry with a given key wins, at the
 * position of that key's first appearance. Two custom entries that share a
 * key have no defined meaning, because one of them can never be reached. The
 * merge also resolves this collision inconsistently: last wins where the key
 * matches a default, first wins where it does not. This function dedupes a
 * library on the way in, so no reader downstream has to guess. Last wins
 * here because that is what upsertEntry does, so a file built by appending
 * edits reads back as the newest version of each entry. This function is
 * pure.
 * @template {object} T
 * @param {T[]} entries
 * @param {(entry: T) => string} keyOf
 * @returns {T[]}
 */
function dedupeByKey(entries, keyOf) {
  const byKey = new Map(entries.map((e) => [keyOf(e), e]));
  return [...byKey.values()];
}

/**
 * Normalize parsed custom-library JSON from any source (an exported file, a
 * hand-edited file, or invalid data) into a valid CustomLibrary. This
 * function drops entries that are missing essential fields, instead of
 * throwing an error.
 * Creature templates get an id (built from the name when absent), a
 * validated disposition, a positive max HP, a stat block over the fixed
 * stat set, and explicit gear. A file written before the creature merge
 * carries `bestiary` and `npcs` lists instead. Those entries read into the
 * same pool: a bestiary entry defaults to hostile, and a `statBlock` field
 * reads as `stats`. Spells get an id, defaulted descriptive fields, and a
 * repaired effect (see normalizeSpell). Feats get the same treatment through
 * normalizeFeat, with effects the parser cannot repair dropped one by one.
 * Each list is also deduped by its merge key, so no reader downstream sees
 * two entries competing for one key.
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
  /** The name merge key for a raw record. Each list already made sure that
   * the record has a name.
   * @param {Record<string, any>} e
   * @returns {string} */
  const rawNameKey = (e) => nameKey({ name: e.name });

  // A weapon entry coerces to the property model on the way in. Library
  // files carry no version, so a file written before the weapon overhaul
  // can arrive at any time, with a legacy `handling` field.
  const equipment = dedupeByKey(
    arrayOf(source.equipment)
      .filter((e) => typeof e.name === 'string' && e.name.trim() && ITEM_TYPES.includes(e.type))
      .map((e) => {
        const named = /** @type {Record<string, any>} */ ({ ...e, name: e.name.trim() });
        if (!WEAPON_TYPES.includes(e.type)) return /** @type {EquipmentTemplate} */ (named);
        return /** @type {EquipmentTemplate} */ (withCoercedWeapon(named));
      }),
    equipmentKey,
  );

  // The name-keyed lists dedupe before id derivation, not after. This way a
  // dropped duplicate never claims a slug that the surviving entry can use.
  // The pool merges the current list with the two pre-merge lists, and the
  // dedupe runs across all three, so an old file that named one creature in
  // both lists keeps one entry. Each list claims its ids through idClaimer,
  // so a hand-edited id that names a different built-in entry, or that an
  // earlier entry in the list already holds, is replaced by a fresh slug.
  /** @type {string[]} */
  const creatureIds = [];
  const claimCreatureId = idClaimer(DEFAULT_CREATURES, nameKey);
  const creatures = dedupeByKey(
    [
      ...arrayOf(source.creatures),
      ...arrayOf(source.bestiary).map(
        (e) => /** @type {Record<string, any>} */ ({ disposition: 'hostile', ...e }),
      ),
      ...arrayOf(source.npcs),
    ].filter((e) => typeof e.name === 'string' && e.name.trim()),
    rawNameKey,
  ).map((e) => {
    const name = e.name.trim();
    const id = claimCreatureId(e.id, name, creatureIds);
    creatureIds.push(id);
    // Only a written number is a level. `Number(null)` is 0, so a looser test
    // would stamp a null level as a level 1 mob with level 1 gear.
    const level = /** @type {number} */ (e.level);
    const hasLevel = typeof level === 'number' && Number.isFinite(level);
    const tier = e.tier === 'legend' ? 'legend' : 'mob';
    const stamp = hasLevel ? defaultEnemyGear(clampInt(level, 1), tier) : null;
    // A null value survives, for a deliberately unarmed entry. An absent or
    // malformed value takes the level default on a leveled entry, and null
    // on an unleveled one. That is what absence meant in each older shape.
    /** @param {'weapon' | 'armor'} slot @returns {object | null} */
    const gear = (slot) => {
      const value =
        e[slot] === null || (e[slot] && typeof e[slot] === 'object')
          ? e[slot]
          : (stamp?.[slot] ?? null);
      // A creature's weapon coerces the same way an equipment entry does.
      if (slot !== 'weapon' || !value) return value;
      return withCoercedWeapon(/** @type {Record<string, any>} */ (value));
    };
    const stats = e.stats ?? e.statBlock;
    // A rating is written either as a number or as a fraction such as "1/4".
    // A value that names no defined step is dropped, and the entry is unrated.
    const cr = coerceCR(e.cr);
    return /** @type {CreatureTemplate} */ ({
      id,
      name,
      disposition: DISPOSITIONS.includes(e.disposition) ? e.disposition : 'neutral',
      maxHP: clampInt(e.maxHP, 1, Infinity, DEFAULT_CREATURE_HP),
      stats: normalizeStatBlock(stats && typeof stats === 'object' ? stats : {}),
      weapon: gear('weapon'),
      armor: gear('armor'),
      ...(hasLevel ? { level: clampInt(level, 1), tier } : {}),
      ...(cr === undefined ? {} : { cr }),
      // An entry trained in nothing carries no list, and an entry that names an
      // unknown ability or skill loses that one entry.
      ...creatureProficiencyFields(e.proficiencies),
      ...(typeof e.role === 'string' && e.role ? { role: e.role } : {}),
      ...(typeof e.notes === 'string' && e.notes ? { notes: e.notes } : {}),
      ...casterTemplateFrom(e),
    });
  });

  /** @type {string[]} */
  const spellIds = [];
  const claimSpellId = idClaimer(DEFAULT_SPELLS, nameKey);
  const spells = dedupeByKey(
    arrayOf(source.spells).filter((e) => typeof e.name === 'string' && e.name.trim()),
    rawNameKey,
  ).map((e) => {
    const id = claimSpellId(e.id, e.name.trim(), spellIds);
    spellIds.push(id);
    return normalizeSpell(e, id);
  });

  /** @type {string[]} */
  const featIds = [];
  const claimFeatId = idClaimer(DEFAULT_FEATS, nameKey);
  const feats = dedupeByKey(
    arrayOf(source.feats).filter((e) => typeof e.name === 'string' && e.name.trim()),
    rawNameKey,
  ).map((e) => {
    const id = claimFeatId(e.id, e.name.trim(), featIds);
    featIds.push(id);
    return normalizeFeat(e, id);
  });

  return { equipment, creatures, spells, feats };
}

/* --------------------------------------------------------------------------
 * Active library registry. This is the one deliberate piece of module state
 * in the project. The pickers that offer presets (the item form, the enemy
 * gear selects, "From bestiary") mount far from the wiring that loads the
 * GM's customizations. These getters let the pickers read the merged lists
 * directly, instead of passing a library through every mount call.
 * libraryWiring sets this state at startup and after every edit or import.
 * Everything below applies the pure merge logic above to the registered
 * custom entries.
 * ------------------------------------------------------------------------ */

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
 *   armors?: import('../types/entities.js').EnemyArmor[],
 *   creatures?: { entry: CreatureTemplate, source: LibrarySource }[],
 *   creatureList?: CreatureTemplate[],
 *   spells?: { entry: Spell, source: LibrarySource }[],
 *   spellList?: Spell[],
 *   spellIndex?: Map<string, Spell>,
 *   feats?: { entry: Feat, source: LibrarySource }[],
 *   featList?: Feat[],
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

/** Every merged body-armor template as an enemy armor choice: the name, plus
 * the flat bonus that its base AC adds over the unarmored value of 10.
 * @returns {import('../types/entities.js').EnemyArmor[]} */
export function activeArmors() {
  return (cache.armors ??= activeEquipmentEntries()
    .map((e) => e.entry)
    .filter((e) => e.type === 'armor' && e.baseAC !== undefined)
    .map((e) => ({ name: e.name, acBonus: /** @type {number} */ (e.baseAC) - 10 })));
}

/** A merged armor template as an enemy's worn armor, or null for an unknown
 * name. This function is the library-aware twin of enemyArmor in
 * Equipment.js.
 * @param {string} name
 * @returns {import('../types/entities.js').EnemyArmor | null} */
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

/** A merged feat by name, or null for a name no entry carries. The name is
 * the merge key, so a character's stamped feat name still finds its entry
 * after a GM customizes it. The comparison ignores case and surrounding
 * spaces, the same way the merge does.
 * @param {string} name
 * @returns {Feat | null} */
export function activeFeatByName(name) {
  const key = nameKey({ name });
  return activeFeats().find((f) => nameKey(f) === key) ?? null;
}

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
