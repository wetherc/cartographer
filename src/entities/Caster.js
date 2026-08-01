import { isCasterClass, casterSlots } from './Classes.js';
import { emptySpellbook } from './Character.js';
import { spliceReservedPools } from './Resource.js';
import { isSlotPool, isCasterPool } from './SpellSlots.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/entities.js').Encounter} Encounter */
/** @typedef {import('../types/npc.js').NPC} NPC */
/** @typedef {import('../types/class.js').ClassRef} ClassRef */
/** @typedef {import('../types/entities.js').ResourcePool} ResourcePool */
/** @typedef {import('../types/entities.js').Spellbook} Spellbook */

/**
 * The options that stamp caster fields onto an entity.
 * @typedef {{
 *   class?: string,
 *   subclass?: string,
 *   casterLevel?: number,
 *   spellbook?: Spellbook,
 * }} CasterOptions
 */

/**
 * The union of the caster-relevant fields across the three combatant
 * shapes. A Character, an Encounter, and an NPC are all assignable to it.
 * Every field that only some of them carry is optional. This is what lets
 * the readers and writers below take any combatant without a cast.
 * @typedef {{
 *   id: string,
 *   name: string,
 *   classes?: ClassRef[],
 *   class?: string,
 *   subclass?: string,
 *   level?: number,
 *   casterLevel?: number,
 *   stats?: Record<string, number>,
 *   statBlock?: Record<string, number>,
 *   resources?: ResourcePool[],
 *   spellbook?: Spellbook,
 * }} CasterEntity
 */

/**
 * A caster's view of any combatant, in the exact field shape the pure spell
 * helpers (`castSpell`, `spellSaveDC`, `spellAttackBonus`, `getSlotPools`) read.
 * @typedef {{
 *   id: string,
 *   name: string,
 *   classes: ClassRef[],
 *   level: number,
 *   stats: Record<string, number>,
 *   resources: ResourcePool[],
 *   spellbook?: Spellbook,
 * }} CasterView
 */

/**
 * An entity's classes as a list, whichever shape it stores them in. A
 * Character carries a `classes` list, while an Encounter and an NPC carry a
 * scalar `class` and `subclass` pair at their caster level. Normalizing here
 * keeps `CasterView` one shape, so every class-aware spell helper reads the
 * list, and no caller must know which kind of combatant it was handed.
 * @param {CasterEntity} e
 * @param {number} level the caster level the scalar pair sits at
 * @returns {ClassRef[]}
 */
function casterClasses(e, level) {
  if (Array.isArray(e.classes)) return e.classes;
  if (!e.class) return [];
  return [{ classId: e.class, level, subclass: e.subclass }];
}

/**
 * Present any combatant (a party Character, an Encounter (mob), or an NPC)
 * as a caster with the field shape the pure spell helpers read. This
 * bridges the three ways combatants differ from a Character. An Encounter
 * keeps its ability scores in `statBlock` (not `stats`), an NPC has no
 * fighting level, and both store one scalar class rather than a class
 * list. So `stats` falls back to `statBlock`, `level` falls back to the
 * explicit `casterLevel` (then the entity's own `level`, then 1), and
 * `classes` falls back to the scalar pair read as a one-entry list at that
 * caster level. The result is a plain read-only view. Write a spent slot
 * back onto the real entity with `withCasterState`.
 * @param {CasterEntity} entity
 * @returns {CasterView}
 */
export function toCaster(entity) {
  const level = entity.casterLevel ?? entity.level ?? 1;
  return {
    id: entity.id,
    name: entity.name,
    classes: casterClasses(entity, level),
    level,
    stats: entity.stats ?? entity.statBlock ?? {},
    resources: entity.resources ?? [],
    spellbook: entity.spellbook,
  };
}

/**
 * Whether an entity is a spellcaster: it carries at least one caster class
 * and a spellbook. The function reads through `toCaster`, so a Character's
 * class list and an Encounter's or NPC's scalar class both answer. The
 * function excludes non-casters (and older saves).
 * @param {Character | Encounter | NPC} entity
 * @returns {boolean}
 */
export function isCaster(entity) {
  const view = toCaster(entity);
  return view.classes.some((ref) => isCasterClass(ref.classId)) && !!view.spellbook;
}

/**
 * Write a resolved cast's spent slots back onto the real entity. `castSpell`
 * returns a caster view with the slot decremented. This function splices
 * those resources (the slot and pact pools) onto the entity, replacing its
 * own and keeping any non-slot resources it can have. This function is
 * pure.
 * @template {CasterEntity} T
 * @param {T} entity
 * @param {{ resources: ResourcePool[] }} caster the resolver's returned caster
 * @returns {T}
 */
export function withCasterState(entity, caster) {
  const slots = caster.resources.filter(isCasterPool);
  return {
    ...entity,
    resources: spliceReservedPools(entity.resources ?? [], slots, isCasterPool),
  };
}

/**
 * Stamp fresh caster fields onto an entity from authoring options: class,
 * optional subclass, caster level, an (empty by default) spellbook, and
 * full slot pools rebuilt for the class and level. A non-caster class (or
 * none) leaves the entity untouched, so this function is safe to call for
 * every create or edit. The function replaces any prior slot pools, and
 * non-slot resources survive.
 * @template {CasterEntity} T
 * @param {T} entity
 * @param {CasterOptions} [options]
 * @param {number} [defaultLevel] caster level when options omit one
 * @returns {T}
 */
export function withCasterFields(entity, options = {}, defaultLevel = 1) {
  if (!isCasterClass(options.class)) return entity;
  const casterLevel = Math.max(1, Math.floor(options.casterLevel ?? defaultLevel) || 1);
  return {
    ...entity,
    class: options.class,
    ...(options.subclass ? { subclass: options.subclass } : {}),
    casterLevel,
    spellbook: options.spellbook ?? emptySpellbook(),
    resources: spliceReservedPools(
      entity.resources ?? [],
      casterSlots(options.class, casterLevel),
      isSlotPool,
    ),
  };
}

/**
 * Backfill caster fields on an entity loaded from a save. The function
 * keeps stored slot pools (so spent slots survive a reload), but supplies a
 * caster level, an empty spellbook, and slot pools if any are missing. A
 * non-caster returns unchanged. Use this function in `withDefaults`. Use
 * `withCasterFields` instead for a fresh create or edit where full slots
 * are wanted.
 * @template {CasterEntity} T
 * @param {T} entity
 * @param {number} [defaultLevel]
 * @returns {T}
 */
export function ensureCasterFields(entity, defaultLevel = 1) {
  if (!isCasterClass(entity.class)) return entity;
  const casterLevel = entity.casterLevel ?? defaultLevel;
  const stored = entity.resources ?? [];
  return {
    ...entity,
    casterLevel,
    spellbook: entity.spellbook ?? emptySpellbook(),
    resources: stored.some(isSlotPool) ? stored : casterSlots(entity.class, casterLevel),
  };
}

/**
 * The caster fields to persist in a template (bestiary or NPC): the identity
 * of the caster, not its live slots. Those slots rebuild from class and
 * level on spawn. Returns an empty object for a non-caster, to spread into
 * a template literal.
 * @param {{ class?: string, subclass?: string, casterLevel?: number, spellbook?: Spellbook }} entity
 * @returns {CasterOptions}
 */
export function casterTemplateFields(entity) {
  if (!isCasterClass(entity.class)) return {};
  return {
    class: entity.class,
    ...(entity.subclass ? { subclass: entity.subclass } : {}),
    ...(entity.casterLevel !== undefined ? { casterLevel: entity.casterLevel } : {}),
    spellbook: entity.spellbook ?? emptySpellbook(),
  };
}
