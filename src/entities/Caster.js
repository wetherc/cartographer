import { isCasterClass, casterSlots } from './Classes.js';
import { emptySpellbook } from './Character.js';
import { isSlotPool } from './SpellSlots.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/entities.js').Encounter} Encounter */
/** @typedef {import('../types/npc.js').NPC} NPC */
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
 *   class?: string,
 *   subclass?: string,
 *   level: number,
 *   stats: Record<string, number>,
 *   resources: ResourcePool[],
 *   spellbook?: Spellbook,
 * }} CasterView
 */

/**
 * Present any combatant — a party Character, an Encounter (mob), or an NPC — as
 * a caster with the field shape the pure spell helpers read. This bridges the
 * two ways combatants differ from a Character: an Encounter keeps its ability
 * scores in `statBlock` (not `stats`), and an NPC has no fighting level, so
 * `stats` falls back to `statBlock` and `level` to the explicit `casterLevel`
 * (then the entity's own `level`, then 1). The result is a plain read-only
 * view — write a spent slot back onto the real entity with `withCasterState`.
 * @param {Character | Encounter | NPC} entity
 * @returns {CasterView}
 */
export function toCaster(entity) {
  const e = /** @type {any} */ (entity);
  return {
    id: e.id,
    name: e.name,
    class: e.class,
    subclass: e.subclass,
    level: e.casterLevel ?? e.level ?? 1,
    stats: e.stats ?? e.statBlock ?? {},
    resources: e.resources ?? [],
    spellbook: e.spellbook,
  };
}

/**
 * Whether an entity is a spellcaster: it carries a caster class and a
 * spellbook. Non-casters (and older saves) are excluded.
 * @param {Character | Encounter | NPC} entity
 * @returns {boolean}
 */
export function isCaster(entity) {
  const e = /** @type {any} */ (entity);
  return isCasterClass(e.class) && !!e.spellbook;
}

/**
 * Write a resolved cast's spent slots back onto the real entity. `castSpell`
 * returns a caster view with the slot decremented; this splices those resources
 * (the slot pools) onto the entity, replacing its own slot pools and keeping
 * any non-slot resources it may have. Pure.
 * @template T
 * @param {T} entity
 * @param {CasterView} caster the resolver's returned caster
 * @returns {T}
 */
export function withCasterState(entity, caster) {
  const e = /** @type {any} */ (entity);
  const others = (e.resources ?? []).filter((/** @type {ResourcePool} */ r) => !isSlotPool(r));
  const slots = caster.resources.filter(isSlotPool);
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
