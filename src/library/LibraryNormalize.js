/**
 * The import normalizers of the custom library. They turn parsed JSON from
 * any source (an exported file, a hand-edited file, or invalid data) into a
 * valid CustomLibrary, and drop what they cannot repair.
 */

import { withHeals } from '../entities/HealDice.js';
import { withCost } from '../entities/Purse.js';
import { normalizeSpell } from '../entities/SpellEntry.js';
import { spellbookOf } from '../entities/LoadCoercion.js';
import { emptySpellbook } from '../entities/CharacterSpellbook.js';
import { WEAPON_TYPES, ITEM_TYPES } from '../entities/Equipment.js';
import { clampInt } from '../util/num.js';
import { normalizeRider } from '../entities/Riders.js';
import { DEFAULT_SPELLS } from '../data/spells.js';
import { coerceWeapon } from '../entities/EquipmentPresets.js';
import { coerceCR } from '../data/challenge.js';
import { ABILITY_SCORES, normalizeStatBlock } from '../entities/Modifiers.js';
import { SKILL_IDS } from '../data/skills.js';
import { DEFAULT_FEATS, FEAT_EFFECT_KINDS } from '../data/feats.js';
import { DEFAULT_CREATURE_HP, DISPOSITIONS } from '../entities/Creature.js';
import { defaultEnemyGear } from '../entities/CreatureLoadout.js';
import { castsAs } from '../entities/ClassCasting.js';
import { coerceEnemyArmor } from '../entities/EnemyArmor.js';
import { creatureProficiencyFields, ARMOR_PROFICIENCIES } from '../entities/Proficiencies.js';
import { defenseFields } from '../entities/DamageDefenses.js';
import { creatureTypeFields } from '../entities/CreatureType.js';
import { attackTraitFields } from '../entities/CreatureAttacks.js';
import { actionFields } from '../entities/CreatureActions.js';
import { normalizeHitSave } from '../combat/HitSave.js';
import { idClaimer } from './LibraryIdentity.js';
import { DEFAULT_CREATURES } from '../data/creatures.js';
import { normalizeFeatRequirement } from '../entities/FeatRequirement.js';
import { equipmentKey, nameKey } from './LibraryMerge.js';
import { normalizeTable } from '../dice/RandomTable.js';

/** @typedef {import('../types/library.js').EquipmentTemplate} EquipmentTemplate */
/** @typedef {import('../types/library.js').CustomLibrary} CustomLibrary */
/** @typedef {import('../types/creature.js').CreatureTemplate} CreatureTemplate */
/** @typedef {import('../types/feat.js').Feat} Feat */

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
    magical: _magical,
    ...rest
  } = raw;
  // Only a true flag is kept, so a string "false" in a hand-edited file
  // cannot mark the weapon magical.
  return { ...rest, ...coerceWeapon(raw), ...(raw.magical === true ? { magical: true } : {}) };
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
function trimmedUniqueStrings(value) {
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
        if (e.kind === 'concentrationAdvantage') {
          return [{ kind: /** @type {'concentrationAdvantage'} */ ('concentrationAdvantage') }];
        }
        if (e.kind === 'hitDieFloor')
          return [{ kind: /** @type {'hitDieFloor'} */ ('hitDieFloor') }];
        if (e.kind === 'hp') {
          // A whole number of HP per level, 1 to 10. Zero grants nothing.
          const perLevel = clampInt(e.perLevel, 0, 10, 0);
          return perLevel > 0 ? [{ kind: /** @type {'hp'} */ ('hp'), perLevel }] : [];
        }
        if (e.kind === 'initiative') {
          // A whole bonus from 1 to 10. Zero grants nothing.
          const bonus = clampInt(e.bonus, 0, 10, 0);
          return bonus > 0 ? [{ kind: /** @type {'initiative'} */ ('initiative'), bonus }] : [];
        }
        const skills = normalizeChoice(e.skills, SKILL_IDS);
        const saves = normalizeChoice(e.saves, ABILITY_SCORES);
        const expertise = normalizeChoice(e.expertise, SKILL_IDS);
        const armor = /** @type {import('../types/class.js').ArmorProficiency[]} */ (
          trimmedUniqueStrings(e.armor).filter((a) =>
            ARMOR_PROFICIENCIES.includes(/** @type {never} */ (a)),
          )
        );
        const tools = trimmedUniqueStrings(e.tools);
        const languages = trimmedUniqueStrings(e.languages);
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
  const requires = normalizeFeatRequirement(raw.requires);
  return {
    id,
    name: raw.name.trim(),
    description: typeof raw.description === 'string' ? raw.description : '',
    ...(prerequisite ? { prerequisite } : {}),
    ...(requires ? { requires } : {}),
    ...(raw.repeatable ? { repeatable: true } : {}),
    effects,
  };
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
  // A template with no caster level is judged at level 20, because its
  // spawn level is not known yet.
  const level = typeof e.casterLevel === 'number' ? e.casterLevel : 20;
  if (!castsAs(e.class, e.subclass, level)) return {};
  return {
    class: e.class,
    ...(typeof e.subclass === 'string' ? { subclass: e.subclass } : {}),
    // Only a written number counts. A null or absent level is left for the
    // creature's own level, or the level 1 default, to fill.
    ...(typeof e.casterLevel === 'number' && Number.isFinite(e.casterLevel)
      ? { casterLevel: clampInt(e.casterLevel, 1) }
      : {}),
    spellbook: spellbookOf(e.spellbook) ?? emptySpellbook(),
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
        const named = /** @type {Record<string, any>} */ (
          withCost(withHeals({ ...e, name: e.name.trim() }))
        );
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
    const armorValue =
      e.armor === null || (e.armor && typeof e.armor === 'object')
        ? e.armor
        : (stamp?.armor ?? null);
    // A list of weapons keeps its record entries. A single `weapon` field, from
    // an older library file, reads as a list of one, and its null as none.
    const rawWeapons = Array.isArray(e.weapons)
      ? e.weapons
      : e.weapon === null
        ? []
        : e.weapon && typeof e.weapon === 'object'
          ? [e.weapon]
          : stamp
            ? [stamp.weapon]
            : [];
    /** @param {unknown} value @returns {object} */
    const weaponOf = (value) => {
      // A creature's weapon coerces the same way an equipment entry does. An
      // on-hit save that names no known ability, DC, or condition drops out.
      const { onHitSave, ...weapon } = withCoercedWeapon(
        /** @type {Record<string, any>} */ (value),
      );
      const hitSave = normalizeHitSave(onHitSave);
      return hitSave ? { ...weapon, onHitSave: hitSave } : weapon;
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
      weapons: rawWeapons
        .filter((w) => w && typeof w === 'object' && !Array.isArray(w))
        .map(weaponOf),
      armor: armorValue ? coerceEnemyArmor(armorValue) : null,
      ...(hasLevel ? { level: clampInt(level, 1), tier } : {}),
      ...(cr === undefined ? {} : { cr }),
      // An entry trained in nothing carries no list, and an entry that names an
      // unknown ability or skill loses that one entry.
      ...creatureProficiencyFields(e.proficiencies),
      // Unknown damage types drop out the same way.
      ...defenseFields(e.defenses),
      // An unknown type or condition name drops out too.
      ...creatureTypeFields(e),
      // A Multiattack below 2 reads as none.
      ...attackTraitFields(e),
      ...actionFields(e.actions),
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

  const tables = dedupeByKey(
    /** @type {import('../types/table.js').RandomTable[]} */ (
      arrayOf(source.tables).map(normalizeTable).filter(Boolean)
    ),
    nameKey,
  );

  return { equipment, creatures, spells, feats, tables };
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
