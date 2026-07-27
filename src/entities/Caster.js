import { isCasterClass, casterSlots } from './Classes.js';
import { emptySpellbook } from './Character.js';
import { isSlotPool, isPactPool } from './SpellSlots.js';

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
 * An entity's classes as a list, whichever shape it stores them in: a Character
 * carries a `classes` list, while an Encounter and an NPC carry a scalar
 * `class`/`subclass` pair at their caster level. Normalizing here is what keeps
 * `CasterView` one shape, so every class-aware spell helper reads the list and
 * no caller has to know which kind of combatant it was handed.
 * @param {any} e
 * @param {number} level the caster level the scalar pair sits at
 * @returns {ClassRef[]}
 */
function casterClasses(e, level) {
  if (Array.isArray(e.classes)) return e.classes;
  if (!e.class) return [];
  return [{ classId: e.class, level, subclass: e.subclass }];
}

/**
 * Present any combatant — a party Character, an Encounter (mob), or an NPC — as
 * a caster with the field shape the pure spell helpers read. This bridges the
 * three ways combatants differ from a Character: an Encounter keeps its ability
 * scores in `statBlock` (not `stats`), an NPC has no fighting level, and both
 * store one scalar class rather than a class list. So `stats` falls back to
 * `statBlock`, `level` to the explicit `casterLevel` (then the entity's own
 * `level`, then 1), and `classes` to the scalar pair read as a one-entry list at
 * that caster level. The result is a plain read-only
 * view — write a spent slot back onto the real entity with `withCasterState`.
 * @param {Character | Encounter | NPC} entity
 * @returns {CasterView}
 */
export function toCaster(entity) {
  const e = /** @type {any} */ (entity);
  const level = e.casterLevel ?? e.level ?? 1;
  return {
    id: e.id,
    name: e.name,
    classes: casterClasses(e, level),
    level,
    stats: e.stats ?? e.statBlock ?? {},
    resources: e.resources ?? [],
    spellbook: e.spellbook,
  };
}

/**
 * Whether an entity is a spellcaster: it carries at least one caster class and
 * a spellbook. Read through `toCaster`, so a Character's class list and an
 * Encounter's or NPC's scalar class both answer. Non-casters (and older saves)
 * are excluded.
 * @param {Character | Encounter | NPC} entity
 * @returns {boolean}
 */
export function isCaster(entity) {
  const view = toCaster(entity);
  return view.classes.some((ref) => isCasterClass(ref.classId)) && !!view.spellbook;
}

/**
 * Write a resolved cast's spent slots back onto the real entity. `castSpell`
 * returns a caster view with the slot decremented; this splices those resources
 * (the slot and pact pools) onto the entity, replacing its own and keeping
 * any non-slot resources it may have. Pure.
 * @template T
 * @param {T} entity
 * @param {{ resources: ResourcePool[] }} caster the resolver's returned caster
 * @returns {T}
 */
export function withCasterState(entity, caster) {
  const e = /** @type {any} */ (entity);
  const isCasterPool = (/** @type {ResourcePool} */ r) => isSlotPool(r) || isPactPool(r);
  const others = (e.resources ?? []).filter((/** @type {ResourcePool} */ r) => !isCasterPool(r));
  const slots = caster.resources.filter(isCasterPool);
  return /** @type {T} */ ({ ...e, resources: [...others, ...slots] });
}

/**
 * Stamp fresh caster fields onto an entity from authoring options: class,
 * optional subclass, caster level, an (empty by default) spellbook, and full
 * slot pools rebuilt for the class and level. A non-caster class (or none)
 * leaves the entity untouched, so this is safe to call for every create/edit.
 * Any prior slot pools are replaced; non-slot resources survive.
 * @template T
 * @param {T} entity
 * @param {CasterOptions} [options]
 * @param {number} [defaultLevel] caster level when options omit one
 * @returns {T}
 */
export function withCasterFields(entity, options = {}, defaultLevel = 1) {
  if (!isCasterClass(options.class)) return entity;
  const e = /** @type {any} */ (entity);
  const casterLevel = Math.max(1, Math.floor(options.casterLevel ?? defaultLevel) || 1);
  const others = (e.resources ?? []).filter((/** @type {ResourcePool} */ r) => !isSlotPool(r));
  return /** @type {T} */ ({
    ...e,
    class: options.class,
    ...(options.subclass ? { subclass: options.subclass } : {}),
    casterLevel,
    spellbook: options.spellbook ?? emptySpellbook(),
    resources: [...others, ...casterSlots(options.class, casterLevel)],
  });
}

/**
 * Backfill caster fields on an entity loaded from a save: keep stored slot
 * pools (so spent slots survive a reload) but supply a caster level, an empty
 * spellbook, and slot pools if any are missing. A non-caster is returned
 * unchanged. Use this in `withDefaults`; use `withCasterFields` for a fresh
 * create/edit where full slots are wanted.
 * @template T
 * @param {T} entity
 * @param {number} [defaultLevel]
 * @returns {T}
 */
export function ensureCasterFields(entity, defaultLevel = 1) {
  const e = /** @type {any} */ (entity);
  if (!isCasterClass(e.class)) return entity;
  const casterLevel = e.casterLevel ?? defaultLevel;
  const hasSlots = (e.resources ?? []).some(isSlotPool);
  return /** @type {T} */ ({
    ...e,
    casterLevel,
    spellbook: e.spellbook ?? emptySpellbook(),
    resources: hasSlots ? e.resources : casterSlots(e.class, casterLevel),
  });
}

/**
 * The caster fields to persist in a template (bestiary or NPC): the identity of
 * the caster, not its live slots — those rebuild from class/level on spawn.
 * Returns an empty object for a non-caster, to spread into a template literal.
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
