import { normalizeHitRider } from './HitRiders.js';
import { DAMAGE_TYPES, DIE_SIZES, normalizeDamagePart } from './Equipment.js';
import { ABILITY_SCORES } from './Modifiers.js';
import { MAX_HP_BOOST, normalizeChipMods } from './ChipMods.js';
import { clampInt } from '../util/num.js';
import { normalizeTypeList, typeRuleFields } from './SpellTypeRules.js';

/**
 * Normalizers for the spell fields beyond a single roll: damage that stays on
 * a target, the turn boundary that ends a chip, a spell that the caster uses
 * again without a new slot, and what a hit does besides its damage (a save or
 * a chip on the target, and hit points back to the caster), and the HP rules
 * of a save (a pool rolled in place of the save, a kill, and a chip that
 * damage ends), and what a buff's chip changes besides a roll. The authoring
 * form (through `SpellDraft.js`) and the library import (through `Library.js`)
 * share these functions, so a typed spell and an imported one never disagree
 * about what a value means. Each one returns null, or an empty object, for a
 * value that says nothing usable, and the caller then leaves the field off the
 * spell. Every function here is pure.
 */

/** @typedef {import('../types/spell.js').ChipUntil} ChipUntil */
/** @typedef {import('../types/spell.js').SpellOngoing} SpellOngoing */
/** @typedef {import('../types/spell.js').SpellRepeat} SpellRepeat */
/** @typedef {import('../types/spell.js').SpellOnHit} SpellOnHit */
/** @typedef {import('../types/spell.js').SpellDrain} SpellDrain */
/** @typedef {import('../types/spell.js').SpellHpPool} SpellHpPool */
/** @typedef {import('../types/spell.js').Ability} Ability */
/** @typedef {import('../types/entities.js').DamagePart} DamagePart */

/** The turn boundaries a chip can end at, in the order the form lists them.
 * @type {ChipUntil[]} */
export const CHIP_UNTILS = ['caster-start', 'caster-end', 'target-end'];

/** How each boundary reads in the form and the spell detail.
 * @type {Record<ChipUntil, string>} */
export const UNTIL_LABELS = {
  'caster-start': "the start of the caster's next turn",
  'caster-end': "the end of the caster's next turn",
  'target-end': "the end of the target's next turn",
};

/** The costs a repeat can take. @type {('action' | 'bonus')[]} */
export const REPEAT_COSTS = ['action', 'bonus'];

/** The shares of dealt damage a draining spell gives back. @type {SpellDrain[]} */
export const DRAINS = ['half', 'full'];

/**
 * A written boundary, or null when the value names none.
 * @param {unknown} value
 * @returns {ChipUntil | null}
 */
export function normalizeUntil(value) {
  return CHIP_UNTILS.includes(/** @type {ChipUntil} */ (value))
    ? /** @type {ChipUntil} */ (value)
    : null;
}

/**
 * A written list of damage terms, each one repaired. A value that is not a
 * list reads as no terms.
 * @param {unknown} value
 * @returns {DamagePart[]}
 */
export function normalizeParts(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((p) => p && typeof p === 'object').map((p) => normalizeDamagePart(p));
}

/**
 * A written ongoing-damage block, or null when it deals nothing. Damage that
 * rolls no dice on a later turn is not a later-turn effect, so the block needs
 * at least one term.
 * @param {unknown} value
 * @returns {SpellOngoing | null}
 */
export function normalizeOngoing(value) {
  if (!value || typeof value !== 'object') return null;
  const raw = /** @type {Record<string, unknown>} */ (value);
  const damage = normalizeParts(raw.damage);
  if (damage.length === 0) return null;
  const perStep = normalizeParts(raw.perStep);
  const until = normalizeUntil(raw.until);
  return {
    damage,
    ...(perStep.length > 0 ? { perStep } : {}),
    ...(until ? { until } : {}),
  };
}

/**
 * A written repeat block, or null when the spell has none. An empty block is
 * a real repeat: it costs what the casting time costs and resolves the
 * spell's own effect again.
 * @param {unknown} value
 * @returns {SpellRepeat | null}
 */
export function normalizeRepeat(value) {
  if (!value || typeof value !== 'object') return null;
  const raw = /** @type {Record<string, unknown>} */ (value);
  const cost = REPEAT_COSTS.includes(/** @type {'action'} */ (raw.cost))
    ? /** @type {'action' | 'bonus'} */ (raw.cost)
    : null;
  const damage = normalizeParts(raw.damage);
  return { ...(cost ? { cost } : {}), ...(damage.length > 0 ? { damage } : {}) };
}

/**
 * A written on-hit block, or null when it names no condition. A save ability
 * outside the six drops, and the hit then imposes the condition with no save.
 * @param {unknown} value
 * @returns {SpellOnHit | null}
 */
export function normalizeOnHit(value) {
  if (!value || typeof value !== 'object') return null;
  const raw = /** @type {Record<string, unknown>} */ (value);
  const condition = typeof raw.condition === 'string' ? raw.condition.trim() : '';
  if (!condition) return null;
  const saveAbility = ABILITY_SCORES.includes(/** @type {string} */ (raw.saveAbility))
    ? /** @type {Ability} */ (raw.saveAbility)
    : null;
  const until = normalizeUntil(raw.until);
  const mods = normalizeChipMods(raw.mods);
  const typed = normalizeTypedChip(raw.typed);
  return {
    condition,
    ...(saveAbility ? { saveAbility } : {}),
    ...(until ? { until } : {}),
    ...(mods ? { mods } : {}),
    ...(typed ? { typed } : {}),
  };
}

/**
 * A written typed on-hit chip, or null when it names no condition or no known
 * creature type.
 * @param {unknown} value
 * @returns {import('../types/spell.js').SpellOnHitTyped | null}
 */
export function normalizeTypedChip(value) {
  if (!value || typeof value !== 'object') return null;
  const raw = /** @type {Record<string, unknown>} */ (value);
  const condition = typeof raw.condition === 'string' ? raw.condition.trim() : '';
  const types = normalizeTypeList(raw.types);
  if (!condition || types.length === 0) return null;
  const until = normalizeUntil(raw.until);
  const mods = normalizeChipMods(raw.mods);
  return { types, condition, ...(until ? { until } : {}), ...(mods ? { mods } : {}) };
}

/**
 * The later-turn and on-hit fields an attack effect has, from a written effect. Each
 * flag is kept only when it is true, so an effect written before the flags
 * existed comes back unchanged.
 * @param {Record<string, unknown>} raw
 * @returns {Partial<import('../types/spell.js').SpellAttackEffect>}
 */
export function attackExtras(raw) {
  const ongoing = normalizeOngoing(raw.ongoing);
  const onHit = normalizeOnHit(raw.onHit);
  const drain = DRAINS.includes(/** @type {SpellDrain} */ (raw.drain))
    ? /** @type {SpellDrain} */ (raw.drain)
    : null;
  return {
    ...(raw.melee === true ? { melee: true } : {}),
    ...(raw.halfOnMiss === true ? { halfOnMiss: true } : {}),
    ...(raw.addsModifier === true ? { addsModifier: true } : {}),
    ...(ongoing ? { ongoing } : {}),
    ...(onHit ? { onHit } : {}),
    ...(drain ? { drain } : {}),
  };
}

/**
 * A written HP pool, or null when it rolls no dice. The die has to be one of
 * the sizes the dice editor offers.
 * @param {unknown} value
 * @returns {SpellHpPool | null}
 */
export function normalizeHpPool(value) {
  if (!value || typeof value !== 'object') return null;
  const raw = /** @type {Record<string, unknown>} */ (value);
  const count = clampInt(raw.count, 0, 40);
  const sides = Number(raw.sides);
  if (count === 0 || !DIE_SIZES.includes(sides)) return null;
  const perStep = clampInt(raw.perStep, 0, 40);
  return { count, sides, ...(perStep > 0 ? { perStep } : {}) };
}

/**
 * The later-turn and HP fields a save effect has, from a written effect. A
 * boundary, an end on damage, and chip mods mean something only for a chip,
 * so they need a condition.
 * @param {Record<string, unknown>} raw
 * @param {string} condition the condition the save imposes, or empty
 * @returns {Partial<import('../types/spell.js').SpellSaveEffect>}
 */
export function saveExtras(raw, condition) {
  const until = condition ? normalizeUntil(raw.until) : null;
  const ongoing = normalizeOngoing(raw.ongoing);
  const hpPool = normalizeHpPool(raw.hpPool);
  const mods = condition ? normalizeChipMods(raw.mods) : null;
  return {
    ...(until ? { until } : {}),
    ...(ongoing ? { ongoing } : {}),
    ...(hpPool ? { hpPool } : {}),
    ...(raw.kills === true ? { kills: true } : {}),
    ...(condition && raw.endsOnDamage === true ? { endsOnDamage: true } : {}),
    ...typeRuleFields(raw),
    ...(mods ? { mods } : {}),
  };
}

/**
 * The fields a buff effect has beyond its chip name and rider, from a written
 * effect: what the chip changes besides a roll and how much more of the HP
 * raise each scaling increment adds, the temporary HP of the cast and of
 * each turn, and the turn boundary that ends the chip.
 * @param {Record<string, unknown>} raw
 * @returns {Partial<import('../types/spell.js').SpellBuffEffect>}
 */
export function buffExtras(raw) {
  const mods = normalizeChipMods(raw.mods);
  const until = normalizeUntil(raw.until);
  const perStep = /** @type {Record<string, unknown>} */ (raw.modsPerStep ?? {});
  const raise = clampInt(perStep.maxHP, 0, MAX_HP_BOOST);
  const tempHP = normalizeTempHP(raw.tempHP);
  const hit = normalizeHitRider(raw.hit);
  const resistChoice = Array.isArray(raw.resistChoice)
    ? DAMAGE_TYPES.filter((t) => /** @type {unknown[]} */ (raw.resistChoice).includes(t))
    : [];
  return {
    ...(mods ? { mods } : {}),
    ...(raise > 0 ? { modsPerStep: { maxHP: raise } } : {}),
    ...(tempHP ? { tempHP } : {}),
    ...(raw.tempEachTurn === true ? { tempEachTurn: true } : {}),
    ...(until ? { until } : {}),
    ...(hit ? { hit } : {}),
    ...(resistChoice.length ? { resistChoice } : {}),
  };
}

/**
 * A written temporary HP grant, or null when it grants nothing. The dice
 * need a known die size, and a grant with no dice and no flat amount drops.
 * @param {unknown} value
 * @returns {import('../types/spell.js').SpellTempHP | null}
 */
export function normalizeTempHP(value) {
  if (!value || typeof value !== 'object') return null;
  const raw = /** @type {Record<string, unknown>} */ (value);
  const sides = Number(raw.sides);
  const count = DIE_SIZES.includes(sides) ? clampInt(raw.count, 0, 20) : 0;
  const flat = clampInt(raw.flat, 0, 100);
  const flatPerStep = clampInt(raw.flatPerStep, 0, 100);
  if (count === 0 && flat === 0) return null;
  return {
    count,
    sides: count > 0 ? sides : 4,
    flat,
    ...(flatPerStep > 0 ? { flatPerStep } : {}),
  };
}

/**
 * Whether a save spell resolves with no save die at all. An HP pool never
 * rolls one. An HP limit fails the first save outright, so only a spell whose
 * target retries the save later (Power Word Stun) needs a DC.
 * @param {import('../types/spell.js').SpellEffect} effect
 * @returns {boolean}
 */
export function rollsNoSave(effect) {
  if (effect.kind !== 'save') return false;
  return !!effect.hpPool || (effect.hpLimit !== undefined && !effect.saveEnds);
}

/**
 * A written slot-levels-per-increment count, or 0 for the default of one.
 * @param {unknown} value
 * @returns {number}
 */
export function normalizeLevelsPerStep(value) {
  const levels = clampInt(value, 0, 9);
  return levels > 1 ? levels : 0;
}
