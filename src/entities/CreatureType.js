/**
 * Creature types and condition immunities. A creature keeps its SRD type in
 * `creatureType` and the conditions it cannot take in `conditionImmunities`.
 * A party character counts as humanoid. Every function is pure.
 */

import { CONCENTRATING, CONDITIONS } from './Conditions.js';

/** @typedef {import('../types/creature.js').CreatureType} CreatureType */

/** The SRD creature types, in the order the form lists them. */
export const CREATURE_TYPES = /** @type {const} */ ([
  'aberration',
  'beast',
  'celestial',
  'construct',
  'dragon',
  'elemental',
  'fey',
  'fiend',
  'giant',
  'humanoid',
  'monstrosity',
  'ooze',
  'plant',
  'undead',
]);

/**
 * A stored or typed creature type, lowercase, or undefined when it names no
 * SRD type.
 * @param {unknown} value
 * @returns {CreatureType | undefined}
 */
export function coerceCreatureType(value) {
  const type = String(value ?? '')
    .trim()
    .toLowerCase();
  return /** @type {readonly string[]} */ (CREATURE_TYPES).includes(type)
    ? /** @type {CreatureType} */ (type)
    : undefined;
}

/**
 * A condition immunity list, cleaned: known condition names in their
 * canonical case, without repeats. Concentrating is not a condition a
 * creature can be immune to, so it drops out. An entry that names no condition drops out.
 * @param {unknown} value
 * @returns {string[]}
 */
export function normalizeConditionImmunities(value) {
  if (!Array.isArray(value)) return [];
  const byKey = new Map(
    CONDITIONS.filter((c) => c !== CONCENTRATING).map((c) => [c.toLowerCase(), c]),
  );
  const names = value.map((v) => byKey.get(String(v).trim().toLowerCase()));
  return [...new Set(names)].filter((n) => n !== undefined);
}

/**
 * The type and immunity fields to spread into a creature or a template. A
 * creature with no type and no immunity stores neither key.
 * @param {{ creatureType?: unknown, conditionImmunities?: unknown } | undefined} value
 * @returns {{ creatureType?: CreatureType, conditionImmunities?: string[] }}
 */
export function creatureTypeFields(value) {
  const type = coerceCreatureType(value?.creatureType);
  const immune = normalizeConditionImmunities(value?.conditionImmunities);
  return {
    ...(type ? { creatureType: type } : {}),
    ...(immune.length > 0 ? { conditionImmunities: immune } : {}),
  };
}

/**
 * The creature type an entity fights as. A party character counts as
 * humanoid, and a creature reads its own field. An untyped creature reads as
 * undefined, which no type rule matches.
 * @param {'character' | 'creature'} kind
 * @param {{ creatureType?: unknown } | null | undefined} entity
 * @returns {CreatureType | undefined}
 */
export function creatureTypeOf(kind, entity) {
  return kind === 'character' ? 'humanoid' : coerceCreatureType(entity?.creatureType);
}

/**
 * Whether an entity is immune to a condition, by name in any case.
 * A party character keeps no immunity list, so it is never immune here.
 * @param {object | null | undefined} entity
 * @param {string} condition
 * @returns {boolean}
 */
export function isImmuneToCondition(entity, condition) {
  const key = condition.trim().toLowerCase();
  const own = /** @type {{ conditionImmunities?: unknown } | null | undefined} */ (entity);
  return normalizeConditionImmunities(own?.conditionImmunities).some(
    (c) => c.toLowerCase() === key,
  );
}

/**
 * The type fields a cast target carries for the type rules of a spell: the
 * creature type it fights as, and the conditions it cannot take.
 * @param {'character' | 'creature'} kind
 * @param {object} entity
 * @returns {{ creatureType?: CreatureType, conditionImmunities?: string[] }}
 */
export function castTypeFields(kind, entity) {
  const type = creatureTypeOf(kind, /** @type {{ creatureType?: unknown }} */ (entity));
  const own = /** @type {{ conditionImmunities?: unknown }} */ (entity);
  const immune = kind === 'creature' ? normalizeConditionImmunities(own.conditionImmunities) : [];
  return {
    ...(type ? { creatureType: type } : {}),
    ...(immune.length > 0 ? { conditionImmunities: immune } : {}),
  };
}
