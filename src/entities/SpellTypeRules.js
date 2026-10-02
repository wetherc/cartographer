/**
 * The creature-type rules of a spell: which targets it passes over or alone
 * affects, which save at disadvantage, and which take the maximum damage. The spell data
 * keeps them in `effect.typeRules`, so a GM can author them in the Library.
 * Every function is pure.
 */

import { combineModes } from './ConditionEffects.js';
import { CREATURE_TYPES, normalizeConditionImmunities } from './CreatureType.js';

/** @typedef {import('../types/spell.js').SpellTypeRules} SpellTypeRules */
/** @typedef {import('../types/creature.js').CreatureType} CreatureType */
/** @typedef {import('./Casting.js').CastTarget} CastTarget */

/** The type lists of a rule set, in the order the form shows them. */
export const TYPE_RULE_KEYS = /** @type {const} */ (['skip', 'only', 'disadvantage', 'maxDamage']);

/**
 * A written type list, cleaned: known SRD types, lowercase, without repeats.
 * @param {unknown} value
 * @returns {CreatureType[]}
 */
export function normalizeTypeList(value) {
  if (!Array.isArray(value)) return [];
  const known = /** @type {readonly string[]} */ (CREATURE_TYPES);
  const names = value.map((v) => String(v).trim().toLowerCase()).filter((t) => known.includes(t));
  return /** @type {CreatureType[]} */ ([...new Set(names)]);
}

/**
 * The `typeRules` field to spread into a spell effect, or nothing when the
 * effect names no rule. Each list keeps only known names, and an empty list
 * drops out.
 * @param {Record<string, unknown>} raw the written effect
 * @returns {{ typeRules?: SpellTypeRules }}
 */
export function typeRuleFields(raw) {
  const source = /** @type {Record<string, unknown>} */ (
    raw.typeRules && typeof raw.typeRules === 'object' ? raw.typeRules : {}
  );
  /** @type {SpellTypeRules} */
  const rules = {};
  for (const key of TYPE_RULE_KEYS) {
    const list = normalizeTypeList(source[key]);
    if (list.length > 0) rules[key] = list;
  }
  const immune = normalizeConditionImmunities(source.skipImmuneTo);
  if (immune.length > 0) rules.skipImmuneTo = immune;
  return Object.keys(rules).length > 0 ? { typeRules: rules } : {};
}

/**
 * Why a spell passes over a target, or null when it reaches it. A target of
 * a skipped type, of a type outside the `only` list, or immune to a
 * condition the rules name, is passed over. An untyped target passes the
 * `only` list, so the GM decides for a creature that names no type. The
 * reason reads in the log, for example "undead" or "not humanoid".
 * @param {SpellTypeRules | undefined} rules
 * @param {CastTarget} target
 * @returns {string | null}
 */
export function typeSkipReason(rules, target) {
  if (!rules) return null;
  const type = target.creatureType;
  if (type && rules.skip?.includes(type)) return type;
  if (type && rules.only && !rules.only.includes(type)) return `not ${rules.only.join(' or ')}`;
  const immune = new Set((target.conditionImmunities ?? []).map((c) => c.toLowerCase()));
  const guard = rules.skipImmuneTo?.find((c) => immune.has(c.toLowerCase()));
  return guard ? `immune to ${guard}` : null;
}

/**
 * The save mode of a target once the type rules apply. A target of a type
 * that saves at disadvantage folds a disadvantage into its own mode, so an
 * advantage it already had cancels it.
 * @param {SpellTypeRules | undefined} rules
 * @param {CastTarget} target
 * @returns {CastTarget}
 */
export function withTypeSaveMode(rules, target) {
  const type = target.creatureType;
  if (!type || !rules?.disadvantage?.includes(type)) return target;
  const mode = combineModes([target.saveMode ?? 'normal', 'disadvantage']) ?? 'normal';
  return { ...target, saveMode: mode };
}

/**
 * Whether a target of this type takes the maximum damage of the spell.
 * @param {SpellTypeRules | undefined} rules
 * @param {CastTarget} target
 * @returns {boolean}
 */
export function takesMaxDamage(rules, target) {
  const type = target.creatureType;
  return Boolean(type && rules?.maxDamage?.includes(type));
}

/**
 * A short readout of a rule set, for the spell card, or an empty string. For
 * example "No effect on undead. Saves at disadvantage: plant."
 * @param {SpellTypeRules | undefined} rules
 * @returns {string}
 */
export function typeRulesSummary(rules) {
  if (!rules) return '';
  const skip = [...(rules.skip ?? []), ...(rules.skipImmuneTo ?? []).map((c) => `${c}-immune`)];
  return [
    skip.length > 0 ? `No effect on ${skip.join(', ')}.` : '',
    rules.only ? `Only affects ${rules.only.join(', ')}.` : '',
    rules.disadvantage ? `Saves at disadvantage: ${rules.disadvantage.join(', ')}.` : '',
    rules.maxDamage ? `Maximum damage: ${rules.maxDamage.join(', ')}.` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * The `typeRules` field of a heal effect. A heal rolls no save and deals no
 * damage, so only its skipped types mean anything.
 * @param {Record<string, unknown>} raw the written effect
 * @returns {{ typeRules?: Pick<SpellTypeRules, 'skip'> }}
 */
export function healTypeRules(raw) {
  const skip = typeRuleFields(raw).typeRules?.skip;
  return skip ? { typeRules: { skip } } : {};
}
