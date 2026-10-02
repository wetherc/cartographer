/**
 * The conditions that a healing spell ends. A heal names chips it always
 * ends (`removes`, Heal) and chips of which it ends one (`removesOneOf`,
 * Lesser Restoration and Greater Restoration). The name `Exhaustion` stands
 * for one level of exhaustion, which the app keeps as a number and not as a
 * chip. Every function here is pure. `app/healCure.js` asks the caster to
 * pick and writes the result.
 */

import { exhaustionLevel } from './Exhaustion.js';

/** @typedef {import('../types/spell.js').SpellHealEffect} SpellHealEffect */
/** @typedef {import('../types/entities.js').Condition} Condition */

/** The name that stands for one level of exhaustion. */
export const EXHAUSTION = 'Exhaustion';

/** The most names one list keeps. */
const MAX_NAMES = 12;

/**
 * A list of condition names as the library stores it: trimmed, non-empty,
 * and each name once without case. A value that is not a list, or a list
 * with no usable name, reads as null.
 * @param {unknown} value
 * @returns {string[] | null}
 */
export function cureNames(value) {
  const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  /** @type {string[]} */
  const names = [];
  for (const raw of list) {
    const name = typeof raw === 'string' ? raw.trim() : '';
    if (name && !names.some((n) => n.toLowerCase() === name.toLowerCase())) names.push(name);
  }
  return names.length ? names.slice(0, MAX_NAMES) : null;
}

/**
 * The two cure fields of a heal effect, each present only when it names
 * something. The library import and the spell form both build them here.
 * @param {{ removes?: unknown, removesOneOf?: unknown }} raw
 * @returns {Pick<SpellHealEffect, 'removes' | 'removesOneOf'>}
 */
export function cureFields(raw) {
  const removes = cureNames(raw.removes);
  const removesOneOf = cureNames(raw.removesOneOf);
  return { ...(removes ? { removes } : {}), ...(removesOneOf ? { removesOneOf } : {}) };
}

/**
 * Whether a target has what a name stands for.
 * @param {{ conditions: Condition[], exhaustion?: number }} entity
 * @param {string} name
 * @returns {boolean}
 */
function has(entity, name) {
  if (name.toLowerCase() === EXHAUSTION.toLowerCase()) return exhaustionLevel(entity) > 0;
  return entity.conditions.some((c) => c.name.toLowerCase() === name.toLowerCase());
}

/**
 * What the heal can end on this target: the names it always ends that the
 * target has, and the names of the one-of list that the target has. The
 * caster picks from `choices` when it has more than one entry.
 * @param {SpellHealEffect} effect
 * @param {{ conditions: Condition[], exhaustion?: number }} entity
 * @returns {{ always: string[], choices: string[] }}
 */
export function cureOptions(effect, entity) {
  return {
    always: (effect.removes ?? []).filter((n) => has(entity, n)),
    choices: (effect.removesOneOf ?? []).filter((n) => has(entity, n)),
  };
}

/**
 * The target with the named chips gone and with one level of exhaustion less
 * when `Exhaustion` is named. A chip that a concentration spell imposed
 * comes off like any other chip, and the caster keeps concentrating, which
 * is what the printed spells say. The function returns the entity itself
 * when nothing changes.
 * @template {{ conditions: Condition[], exhaustion?: number }} T
 * @param {T} entity
 * @param {string[]} names
 * @returns {{ entity: T, ended: string[] }} `ended` lists the chip names as
 *   the target had them, then `Exhaustion` when a level came off
 */
export function applyCure(entity, names) {
  const lower = names.map((n) => n.toLowerCase());
  const gone = entity.conditions.filter((c) => lower.includes(c.name.toLowerCase()));
  const tired = lower.includes(EXHAUSTION.toLowerCase()) && exhaustionLevel(entity) > 0;
  if (gone.length === 0 && !tired) return { entity, ended: [] };
  const next = {
    ...entity,
    conditions: entity.conditions.filter((c) => !gone.includes(c)),
    ...(tired ? { exhaustion: exhaustionLevel(entity) - 1 } : {}),
  };
  return { entity: next, ended: [...gone.map((c) => c.name), ...(tired ? [EXHAUSTION] : [])] };
}
